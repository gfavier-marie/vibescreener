// Licence : un essai qui part du premier lancement, puis une clé Polar activée et vérifiée
// directement auprès de l'API publique de Polar, sans serveur à nous (ROADMAP, « Monétisation »).
// Achat unique ou abonnement, c'est pareil ici : Polar révoque la clé d'un abonnement résilié
// (ou d'un achat remboursé) et la vérification suivante le voit. État dans license.json.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { T } from '../texts/index.ts';

/** Durée de l'essai en jours ; la changer vaut aussi pour les essais en cours. */
export const TRIAL_DAYS = 14;
// Domaine provisoire (M0) : à remplacer partout par le domaine acheté.
export const SITE_URL = 'https://vibescreener.dev';
/** Offre achetée : licence à vie ou abonnement mensuel. */
export type Plan = 'lifetime' | 'subscription';

// Organisation Polar (Settings > Organization ID) et portail client, en production et dans le
// bac à sable (essais : PASTILLE_POLAR=sandbox). Chaque offre a sa propre licence (benefit) chez Polar :
// celle d'une clé dit ce qui a été acheté. Le bac à sable n'en a qu'une pour les deux offres.
export const POLAR = {
  production: {
    api: 'https://api.polar.sh',
    org: '1bcec49c-9af5-4f62-a9e9-6048b820fe41',
    portal: 'https://polar.sh/vibescreener/portal',
    plans: { '1e75bb8b-77cb-431c-b236-26b1b450d352': 'lifetime', '3c4f9213-117a-4af2-bebe-a574645a339c': 'subscription' } as Record<string, Plan>,
  },
  sandbox: { api: 'https://sandbox-api.polar.sh', org: '7e12481a-4021-46fb-a821-54346f6427be', portal: 'https://sandbox.polar.sh/vibescreener/portal' },
};

const DAY = 86_400_000;
const CHECK_EVERY = DAY; // la clé est revérifiée une fois par jour
const OFFLINE_GRACE = 30 * DAY; // Polar injoignable : sa dernière réponse vaut 30 jours

export type LicenseView = {
  state: 'trial' | 'expired' | 'licensed' | 'revoked' | 'unverified';
  daysLeft: number; // de l'essai, 0 une fois fini
  key: string; // clé masquée (« ••••1A2B »), vide sans clé
  plan?: Plan; // offre de la clé, quand Polar l'a dite
};

type Stored = {
  trialStartedAt: string;
  installId: string; // identifiant aléatoire, nom de l'activation chez Polar (pas le nom du Mac)
  key?: string;
  activationId?: string;
  checkedAt?: string; // dernière réponse de Polar sur la clé
  valid?: boolean; // cette réponse : clé accordée ou refusée
  benefitId?: string; // licence Polar de la clé, qui dit l'offre achetée
};

export function createLicense(opts: {
  dataDir: string;
  trialDays?: number;
  polar?: { api: string; org: string; plans?: Record<string, Plan> }; // POLAR.production par défaut
  now?: () => number;
  fetch?: typeof fetch;
}) {
  const path = join(opts.dataDir, 'license.json');
  const now = opts.now ?? Date.now;
  const fetchFn = opts.fetch ?? fetch;
  const trialDays = opts.trialDays ?? TRIAL_DAYS;
  const polar = opts.polar ?? POLAR.production;

  let data: Stored | null = null;
  try {
    if (existsSync(path)) data = JSON.parse(readFileSync(path, 'utf8')) as Stored;
  } catch {
    // illisible : un nouvel essai commence
  }
  if (!data) {
    data = { trialStartedAt: new Date(now()).toISOString(), installId: crypto.randomUUID() };
    save();
  }
  const stored = data;

  function save() {
    writeFileSync(path, JSON.stringify(data, null, 2));
  }

  function view(): LicenseView {
    const daysLeft = Math.max(0, Math.ceil((Date.parse(stored.trialStartedAt) + trialDays * DAY - now()) / DAY));
    if (!stored.key) return { state: daysLeft > 0 ? 'trial' : 'expired', daysLeft, key: '' };
    const key = `••••${stored.key.slice(-4)}`;
    const plan = polar.plans?.[stored.benefitId ?? ''];
    const withPlan = plan ? { plan } : {};
    if (!stored.valid) return { state: 'revoked', daysLeft, key, ...withPlan };
    const stale = now() - Date.parse(stored.checkedAt ?? '') > OFFLINE_GRACE;
    return { state: stale ? 'unverified' : 'licensed', daysLeft, key, ...withPlan };
  }

  async function post(endpoint: 'activate' | 'validate', body: Record<string, string>) {
    return fetchFn(`${polar.api}/v1/customer-portal/license-keys/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ organization_id: polar.org, ...body }),
    });
  }

  /** Active la clé sur ce Mac (Polar limite le nombre de Mac par clé) ; une nouvelle clé remplace l'ancienne. */
  async function activate(input: string): Promise<{ ok: true } | { ok: false; error: string }> {
    const key = input.trim();
    const L = T.main.license;
    if (!key) return { ok: false, error: L.emptyKey };
    if (!polar.org) return { ok: false, error: L.notForSale };
    let res: Response;
    try {
      res = await post('activate', { key, label: `Mac ${stored.installId.slice(0, 8)}` });
    } catch {
      return { ok: false, error: L.offline };
    }
    if (res.status === 404 || res.status === 422) return { ok: false, error: L.unknownKey };
    if (res.status === 403) return { ok: false, error: L.refused };
    if (!res.ok) return { ok: false, error: L.polarError(res.status) };
    const activation = (await res.json()) as { id: string; license_key?: { benefit_id?: string } };
    Object.assign(stored, {
      key,
      activationId: activation.id,
      benefitId: activation.license_key?.benefit_id,
      checkedAt: new Date(now()).toISOString(),
      valid: true,
    });
    save();
    return { ok: true };
  }

  /** Revérifie la clé si la dernière réponse date de plus d'un jour ; sans réponse, rien ne change. */
  async function refresh() {
    if (!stored.key || !stored.activationId) return;
    if (now() - Date.parse(stored.checkedAt ?? '') < CHECK_EVERY) return;
    let res: Response;
    try {
      res = await post('validate', { key: stored.key, activation_id: stored.activationId });
    } catch {
      return; // hors ligne
    }
    // 404 : clé révoquée, désactivée, expirée ou activation retirée. Autre erreur : on réessaiera.
    if (res.status !== 200 && res.status !== 404) return;
    // La réponse redonne la licence de la clé : l'offre s'affiche aussi pour une clé activée avant (0.20.0).
    const { benefit_id } = res.status === 200 ? ((await res.json().catch(() => ({}))) as { benefit_id?: string }) : {};
    Object.assign(stored, { checkedAt: new Date(now()).toISOString(), valid: res.status === 200, ...(benefit_id && { benefitId: benefit_id }) });
    save();
  }

  return {
    view,
    /** Nouvelles captures permises : essai en cours ou licence valable. */
    canCapture: () => ['trial', 'licensed'].includes(view().state),
    activate,
    refresh,
  };
}
