// Projets partagés en ligne, synchronisés entre ceux qui ont le lien de collaboration (aucun import d'Electron :
// testable avec node). Sur le relais (R2), chiffrés avec la clé des liens : l'index (projet, revues, revues
// retirées), chaque revue (son session.json) et chaque fichier (image, croquis, document), envoyé une fois.
// Une modification part quelques secondes après ; le relais prévient les autres (la room du projet, comme pour
// la tablette), qui vont la chercher. Une revue modifiée des deux côtés est fusionnée point par point
// (mergeSession) puis renvoyée : l'écriture conditionnelle du relais empêche qu'une version en écrase une autre.

import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import JSZip from 'jszip';
import {
  connectLink,
  fileObjectName,
  importKey,
  mergeSession,
  open as unseal,
  parseShareUrl,
  relaySocketUrl,
  seal,
  sessionContent,
  SHARE_DAYS,
  SHARE_FORMAT,
  shareObjectUrl,
  shareUrl,
  toBase64Url,
  upgradeSession,
  MAX_SHARE_BYTES,
  type Project,
  type Session,
  type ShareIndex,
} from '@pastille/shared';
import { T } from '../texts/index.ts';
import { renameRetry } from './rename.ts';
import type { SessionStore } from './session-store.ts';
import { checkIndex, readSession, sessionFiles, ShareError, summary, zipEntries, type ImportReport, type Source } from './share.ts';

type Fetch = (url: string, init: RequestInit) => Promise<Response>;

/** Partage d'un projet, gardé sur cet ordinateur seulement (shares.json) : le jeton permet d'écrire. */
type Share = {
  relay: string;
  id: string;
  key: string;
  token: string;
  sharedAt: string;
  owner?: boolean; // créé ici : « Arrêter le partage » l'efface pour tous ; sinon on le quitte
  format?: number; // absent : partage de la 0.16 (une revue = un zip), renvoyé en entier au premier passage
  ended?: boolean; // arrêté par son créateur ou expiré : plus synchronisé, la copie reste
  sessions?: Record<string, { etag: string; content: string }>; // dernière version échangée de chaque revue
  sent?: string[]; // fichiers déjà sur le relais
};

export type SyncStatus = 'syncing' | 'synced' | 'offline' | 'ended';

/** Ce que voit le panneau d'un projet partagé. */
export type ShareView = {
  read: string;
  collab: string;
  owner: boolean;
  status: SyncStatus;
  syncedAt?: string;
  error?: string; // hors ligne : pourquoi
  progress?: { done: number; total: number };
};

/** Room du projet sur le relais : un message dit aux autres d'aller chercher les changements. */
export type Room = { notify(): void; close(): void };
export type Connect = (share: { relay: string; id: string; key: string }, events: { changed(): void; online(): void }) => Room;

const CHANGE_DELAY_MS = 3000; // modification d'ici : envoyée après ce calme
const PERIOD_MS = 5 * 60_000; // filet de sécurité si une notification s'est perdue
const INDEX_REFRESH_MS = 7 * 86_400_000; // l'index réécrit au moins chaque semaine : le partage ne s'éteint pas tant qu'on l'ouvre
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const mb = (bytes: number) => Math.ceil(bytes / 1024 / 1024);
const digest = (s: Session) => createHash('sha256').update(sessionContent(s)).digest('base64url');

/** Room par défaut : celle du relais, chiffrée avec la clé du partage, reconnectée d'elle-même. */
export const relayRoom: Connect = (share, events) => {
  const link = connectLink({
    url: relaySocketUrl(share.relay, share.id),
    key: share.key,
    role: 'desktop',
    onMessage: (msg) => msg.type === 'sync' && events.changed(),
    onStatus: (status) => status === 'open' && events.online(),
  });
  return { notify: () => void link.send({ type: 'sync' }), close: () => link.close() };
};

/** Accès aux objets chiffrés d'un partage sur le relais. */
export function remoteShare(share: { relay: string; id: string; key: string; token?: string }, fetch: Fetch) {
  let imported: Promise<CryptoKey> | null = null; // importée au premier usage, attendue aussitôt
  const key = () =>
    (imported ??= importKey(share.key).catch(() => {
      throw new ShareError(T.share.badKey);
    }));
  const auth = share.token ? { Authorization: `Bearer ${share.token}` } : undefined;

  async function request(name: string | null, init: RequestInit): Promise<Response> {
    const url = name === null ? `${share.relay}/share/${share.id}` : shareObjectUrl(share.relay, share.id, name);
    try {
      return await fetch(url, { ...init, headers: { ...auth, ...(init.headers as Record<string, string>) } });
    } catch (err) {
      throw new ShareError(T.share.offline(err instanceof Error ? err.message : String(err)));
    }
  }

  /** null : absent (ou partage arrêté, expiré). */
  async function get(name: string): Promise<{ data: Uint8Array<ArrayBuffer>; etag: string } | null> {
    const res = await request(name, { method: 'GET' });
    if (res.status === 404) return null;
    if (!res.ok) throw new ShareError(T.share.refused(res.status));
    try {
      return { data: await unseal(await key(), new Uint8Array(await res.arrayBuffer())), etag: res.headers.get('ETag') ?? '' };
    } catch {
      throw new ShareError(T.share.badKey);
    }
  }

  /** Nouvelle version (etag), ou null si l'objet a changé entre-temps (`expect` : version connue, ou 'new' pour une création). */
  async function put(name: string, plain: Uint8Array, label: string, expect?: string | 'new'): Promise<string | null> {
    const body = await seal(await key(), new Uint8Array(plain));
    if (body.length > MAX_SHARE_BYTES) throw new ShareError(T.share.tooBig(label, mb(body.length), mb(MAX_SHARE_BYTES)));
    const condition: Record<string, string> = expect === 'new' ? { 'If-None-Match': '*' } : expect ? { 'If-Match': expect } : {};
    const res = await request(name, { method: 'PUT', body, headers: { 'Content-Type': 'application/octet-stream', ...condition } });
    if (res.status === 412) return null;
    if (!res.ok) throw new ShareError(T.share.refused(res.status));
    return res.headers.get('ETag') ?? '';
  }

  return {
    get,
    put,
    async getJson<T>(name: string) {
      const got = await get(name);
      return got && { value: JSON.parse(decoder.decode(got.data)) as T, etag: got.etag };
    },
    putJson: (name: string, value: unknown, label: string, expect?: string | 'new') => put(name, encoder.encode(JSON.stringify(value)), label, expect),
    async remove() {
      const res = await request(null, { method: 'DELETE' });
      if (!res.ok && res.status !== 404) throw new ShareError(T.share.refused(res.status));
    },
  };
}

type Remote = ReturnType<typeof remoteShare>;

/** Projet en ligne lu une fois, pour en faire une copie (lien de lecture collé dans Importer…). */
export async function readLink(text: string, fetch: Fetch): Promise<Source> {
  const link = parseShareUrl(text);
  if (!link) throw new ShareError(T.share.notALink);
  const remote = remoteShare(link, fetch);
  const got = await remote.getJson<ShareIndex>('index');
  if (!got) throw new ShareError(T.share.expired(SHARE_DAYS));
  const index = checkIndex(got.value, SHARE_FORMAT);
  if (index.format === 1)
    // 0.16 : une revue = un zip
    return {
      index,
      files: async (id) => {
        const blob = await remote.get(id);
        if (!blob) throw new ShareError(T.share.expired(SHARE_DAYS));
        return zipEntries(await JSZip.loadAsync(blob.data));
      },
    };
  return {
    index,
    files: async (id) => {
      const doc = await remote.get(id);
      if (!doc) throw new ShareError(T.share.expired(SHARE_DAYS));
      const files = new Map<string, Uint8Array>([['session.json', doc.data]]);
      const session = JSON.parse(decoder.decode(doc.data)) as Session;
      for (const path of sessionFiles(session, { audio: false })) {
        const file = await remote.get(await fileObjectName(id, path));
        if (file) files.set(path, file.data);
      }
      return files;
    },
  };
}

export function createSync(deps: {
  store: SessionStore;
  dataDir: string;
  relay: string;
  fetch: Fetch;
  trash: (dir: string) => Promise<void>; // revue retirée par un autre : à la corbeille ici aussi
  connect?: Connect;
  onStatus?: (projectId: string) => void; // état d'un partage changé, ou revues reçues
}) {
  const { store } = deps;
  const connect = deps.connect ?? relayRoom;
  const sharesPath = join(deps.dataDir, 'shares.json');
  let shares: Record<string, Share> | null = null;
  const rooms = new Map<string, Room>();
  const state = new Map<string, Pick<ShareView, 'status' | 'syncedAt' | 'error' | 'progress'>>();
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const chains = new Map<string, Promise<void>>();
  let period: ReturnType<typeof setInterval> | null = null;

  async function load() {
    if (shares) return shares;
    shares = existsSync(sharesPath) ? (JSON.parse(await readFile(sharesPath, 'utf8')) as Record<string, Share>) : {};
    // Partages de la 0.16 : tous créés ici (on ne pouvait pas en rejoindre)
    for (const share of Object.values(shares)) if (share.format === undefined) share.owner ??= true;
    return shares;
  }

  let saving = Promise.resolve();
  function save() {
    const json = JSON.stringify(shares, null, 2);
    saving = saving
      .catch(() => {})
      .then(async () => {
        await writeFile(sharesPath + '.tmp', json);
        await renameRetry(sharesPath + '.tmp', sharesPath);
      });
    return saving;
  }

  function setState(projectId: string, patch: Partial<Pick<ShareView, 'status' | 'syncedAt' | 'error' | 'progress'>>) {
    state.set(projectId, { ...(state.get(projectId) ?? { status: 'syncing' }), ...patch });
    deps.onStatus?.(projectId);
  }

  function openRoom(projectId: string, share: Share) {
    rooms.get(projectId)?.close();
    rooms.set(projectId, connect(share, { changed: () => schedule(projectId, 300), online: () => schedule(projectId, 0) }));
  }

  function closeRoom(projectId: string) {
    rooms.get(projectId)?.close();
    rooms.delete(projectId);
  }

  /** Revues du projet ici, la revue ouverte lue en mémoire. */
  async function localSessions(projectId: string): Promise<Session[]> {
    const project = (await store.listProjects()).find((p) => p.id === projectId);
    return Promise.all((project?.sessions ?? []).map((s) => readSession(store, s.id)));
  }

  /** Fait entrer une version reçue dans la revue d'ici : la revue ouverte garde son historique d'annulation. */
  async function mergeLocal(id: string, received: Session) {
    if (store.get()?.id === id) store.update((s) => mergeSession(s, received), { patchHistory: true });
    else {
      const mine = await store.readSession(id);
      mergeSession(mine, received);
      await store.writeSession(mine);
    }
  }

  async function uploadFiles(remote: Remote, share: Share, s: Session) {
    const sent = new Set(share.sent);
    for (const path of sessionFiles(s, { audio: false })) {
      const name = await fileObjectName(s.id, path);
      const file = join(store.dir(s), path);
      if (sent.has(name) || !existsSync(file)) continue;
      await remote.put(name, await readFile(file), s.name);
      sent.add(name);
      share.sent = [...sent];
    }
  }

  async function downloadFiles(remote: Remote, share: Share, s: Session) {
    for (const path of sessionFiles(s, { audio: false })) {
      const file = join(store.dir(s), path);
      if (existsSync(file)) continue;
      const name = await fileObjectName(s.id, path);
      const got = await remote.get(name);
      if (!got) continue;
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, got.data);
      share.sent = [...new Set([...(share.sent ?? []), name])];
    }
  }

  /** Version en ligne d'une revue, fusionnée avec celle d'ici (ou ajoutée au projet). */
  async function pull(remote: Remote, share: Share, projectId: string, id: string): Promise<boolean> {
    const got = await remote.getJson<Session>(id);
    if (!got) return false;
    const received = upgradeSession(got.value);
    if (received.id !== id) return false;
    await downloadFiles(remote, share, received);
    const mine = await readSession(store, id).catch(() => undefined);
    if (mine) await mergeLocal(id, received);
    else {
      await mkdir(join(store.dir(received), 'captures'), { recursive: true });
      await store.replace({ ...received, projectId });
    }
    (share.sessions ??= {})[id] = { etag: got.etag, content: digest(received) };
    return true;
  }

  /** Envoie une revue ; si elle a changé en ligne entre-temps, fusion puis nouvel essai. */
  async function push(remote: Remote, share: Share, id: string) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const s = structuredClone(await readSession(store, id)); // la version envoyée, même si l'on tape pendant l'envoi
      await uploadFiles(remote, share, s);
      const known = share.sessions?.[id];
      const etag = await remote.putJson(id, s, s.name, known?.etag ?? 'new');
      if (etag !== null) {
        (share.sessions ??= {})[id] = { etag, content: digest(s) };
        return;
      }
      if (!(await pull(remote, share, s.projectId ?? '', id))) delete share.sessions?.[id]; // effacée en ligne : renvoyée comme nouvelle
    }
    throw new ShareError(T.share.busy);
  }

  /** Réécrit l'index : projet, revues d'ici à jour, revues retirées ici. */
  async function writeIndex(remote: Remote, share: Share, project: Project, removed: string[]) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const got = await remote.getJson<ShareIndex>('index');
      if (!got) throw new EndedError();
      const index = got.value;
      const now = new Date().toISOString();
      if (project.updatedAt > index.project.updatedAt) index.project = pickProject(project);
      index.deleted ??= {};
      for (const id of removed) index.deleted[id] = now;
      const mine = await localSessions(project.id);
      const entries = new Map(index.sessions.filter((e) => !removed.includes(e.id)).map((e) => [e.id, e]));
      for (const s of mine) {
        const known = share.sessions?.[s.id];
        if (!known) continue;
        entries.set(s.id, { ...summary(s), etag: known.etag });
        delete index.deleted[s.id]; // revenue ici, plus récente que son retrait
      }
      Object.assign(index, { format: SHARE_FORMAT, sessions: [...entries.values()], sharedAt: now });
      if ((await remote.putJson('index', index, project.name, got.etag)) !== null) return;
    }
    throw new ShareError(T.share.busy);
  }

  /** Un passage : récupère ce qui a changé en ligne, envoie ce qui a changé ici. */
  async function syncNow(projectId: string) {
    const share = (await load())[projectId];
    if (!share || share.ended) return;
    const project = (await store.projects()).find((p) => p.id === projectId);
    if (!project) return void (await leave(projectId)); // projet supprimé ici
    const remote = remoteShare(share, deps.fetch);
    setState(projectId, { status: 'syncing' });
    try {
      if (share.format !== SHARE_FORMAT) return void (await publishAll(projectId, remote, share));
      const got = await remote.getJson<ShareIndex>('index');
      if (!got) throw new EndedError();
      const index = got.value;
      const known = (share.sessions ??= {});
      let received = false;
      // Projet renommé, contexte changé ailleurs
      if (index.project.updatedAt > project.updatedAt) {
        await store.putProject({ ...pickProject(index.project), id: projectId });
        received = true;
      }
      // Revues retirées ailleurs : à la corbeille ici, sauf si elles ont changé ici depuis
      const before = await localSessions(projectId);
      for (const [id, at] of Object.entries(index.deleted ?? {})) {
        const mine = before.find((s) => s.id === id);
        if (!mine || (mine.updatedAt > at && known[id]?.content !== digest(mine))) continue;
        if (store.get()?.id === id) await store.close();
        await deps.trash(store.dir(mine)).catch(() => {});
        delete known[id];
        received = true;
      }
      // Revues modifiées ou ajoutées ailleurs
      for (const entry of index.sessions) {
        if (known[entry.id]?.etag === entry.etag || index.deleted?.[entry.id]) continue;
        received = (await pull(remote, share, projectId, entry.id)) || received;
      }
      // Revues modifiées ou ajoutées ici
      const mine = await localSessions(projectId);
      const changed = mine.filter((s) => known[s.id]?.content !== digest(s));
      for (const s of changed) await push(remote, share, s.id);
      // Revues retirées ici (corbeille, rangées dans un autre projet)
      const here = new Set(mine.map((s) => s.id));
      const removed = Object.keys(known).filter((id) => !here.has(id));
      const stale = Date.now() - Date.parse(index.sharedAt) > INDEX_REFRESH_MS;
      if (changed.length || removed.length || project.updatedAt > index.project.updatedAt || stale) {
        await writeIndex(remote, share, project, removed);
        for (const id of removed) delete known[id];
        rooms.get(projectId)?.notify();
      }
      await save();
      setState(projectId, { status: 'synced', syncedAt: new Date().toISOString(), error: undefined, progress: undefined });
      if (received) deps.onStatus?.(projectId);
    } catch (err) {
      if (err instanceof EndedError) {
        share.ended = true;
        closeRoom(projectId);
        await save();
        setState(projectId, { status: 'ended', progress: undefined });
        return;
      }
      await save();
      setState(projectId, { status: 'offline', error: err instanceof Error ? err.message : String(err), progress: undefined });
      if (!(err instanceof ShareError)) console.error('Synchronisation du projet :', err);
    }
  }

  /** Envoi complet : création du partage, ou partage de la 0.16 passé au format en ligne actuel. */
  async function publishAll(projectId: string, remote: Remote, share: Share) {
    const project = (await store.projects()).find((p) => p.id === projectId)!;
    const sessions = await localSessions(projectId);
    share.sessions = {};
    share.sent = [];
    const total = sessions.length + 1;
    setState(projectId, { status: 'syncing', progress: { done: 0, total } });
    for (const [i, s] of sessions.entries()) {
      const snapshot = structuredClone(s);
      await uploadFiles(remote, share, snapshot);
      const etag = await remote.putJson(s.id, snapshot, s.name);
      share.sessions[s.id] = { etag: etag ?? '', content: digest(snapshot) };
      setState(projectId, { progress: { done: i + 1, total } });
    }
    const now = new Date().toISOString();
    const index: ShareIndex = {
      app: 'vibescreener',
      format: SHARE_FORMAT,
      project: pickProject(project),
      sessions: sessions.map((s) => ({ ...summary(s), etag: share.sessions![s.id]!.etag })),
      deleted: {},
      sharedAt: now,
    };
    await remote.putJson('index', index, project.name);
    share.format = SHARE_FORMAT;
    share.sharedAt = now;
    await save();
    rooms.get(projectId)?.notify();
    setState(projectId, { status: 'synced', syncedAt: now, progress: undefined });
  }

  function schedule(projectId: string, delay = CHANGE_DELAY_MS) {
    clearTimeout(timers.get(projectId));
    timers.set(
      projectId,
      setTimeout(() => void run(projectId), delay),
    );
  }

  /** Un passage à la fois par projet. */
  function run(projectId: string): Promise<void> {
    timers.delete(projectId);
    const next = (chains.get(projectId) ?? Promise.resolve()).then(() => syncNow(projectId));
    chains.set(projectId, next.catch(() => {}));
    return next;
  }

  async function leave(projectId: string) {
    const list = await load();
    closeRoom(projectId);
    clearTimeout(timers.get(projectId));
    state.delete(projectId);
    delete list[projectId];
    await save();
    deps.onStatus?.(projectId);
  }

  return {
    /** Au démarrage : chaque projet partagé rejoint sa room et se met à jour. */
    async start() {
      for (const [projectId, share] of Object.entries(await load())) {
        if (share.ended) continue;
        openRoom(projectId, share);
        schedule(projectId, 0);
      }
      period ??= setInterval(() => void this.changedAll(0), PERIOD_MS);
      period.unref?.();
    },

    close() {
      for (const id of [...rooms.keys()]) closeRoom(id);
      for (const t of timers.values()) clearTimeout(t);
      if (period) clearInterval(period);
      period = null;
    },

    /** Une revue de ce projet a changé ici : envoi après quelques secondes de calme. */
    changed(projectId: string | undefined) {
      if (projectId && shares?.[projectId] && !shares[projectId].ended) schedule(projectId);
    },

    /** Projets ou revues changés sans savoir lesquels (import, déplacement, corbeille). */
    async changedAll(delay = CHANGE_DELAY_MS) {
      for (const [projectId, share] of Object.entries(await load())) if (!share.ended) schedule(projectId, delay);
    },

    /** Passage immédiat (tests, et « réessayer »). */
    now: (projectId: string) => run(projectId),

    isShared: (projectId: string) => !!shares?.[projectId] && !shares[projectId].ended,

    async view(projectId: string): Promise<ShareView | undefined> {
      const share = (await load())[projectId];
      if (!share) return undefined;
      const s = state.get(projectId);
      return {
        read: shareUrl(share.relay, share.id, share.key),
        collab: shareUrl(share.relay, share.id, share.key, share.token),
        owner: !!share.owner,
        status: share.ended ? 'ended' : (s?.status ?? 'syncing'),
        syncedAt: s?.syncedAt,
        error: s?.error,
        progress: s?.progress,
      };
    },

    /** Partage le projet : tout est envoyé, puis il reste synchronisé. */
    async create(projectId: string): Promise<ShareView> {
      const list = await load();
      const random = (n: number) => toBase64Url(crypto.getRandomValues(new Uint8Array(n)));
      const share: Share = { relay: deps.relay, id: random(16), key: random(32), token: random(32), sharedAt: new Date().toISOString(), owner: true };
      list[projectId] = share;
      await save();
      openRoom(projectId, share);
      await run(projectId);
      const after = state.get(projectId);
      if (after?.status === 'offline') {
        // Rien n'a pu partir : pas de partage à moitié créé
        await leave(projectId);
        throw new ShareError(after.error ?? T.share.failed(''));
      }
      return (await this.view(projectId))!;
    },

    /** Lien de collaboration collé : le projet est copié ici, puis reste synchronisé. */
    async join(text: string): Promise<ImportReport> {
      const link = parseShareUrl(text);
      if (!link?.token) throw new ShareError(T.share.notALink);
      const remote = remoteShare(link, deps.fetch);
      const got = await remote.getJson<ShareIndex>('index');
      if (!got) throw new ShareError(T.share.expired(SHARE_DAYS));
      const index = checkIndex(got.value, SHARE_FORMAT);
      const projectId = index.project.id;
      if (!(await store.projects()).some((p) => p.id === projectId)) await store.putProject(pickProject(index.project));
      const list = await load();
      // Format en ligne actuel : un lien de collaboration n'existe pas pour un partage de la 0.16
      list[projectId] = { relay: link.relay, id: link.id, key: link.key, token: link.token, sharedAt: index.sharedAt, owner: list[projectId]?.owner, format: SHARE_FORMAT };
      await save();
      openRoom(projectId, list[projectId]!);
      await run(projectId);
      const project = (await store.listProjects()).find((p) => p.id === projectId);
      return { projectId, name: project?.name ?? index.project.name, added: project?.sessions.length ?? 0, updated: 0, unchanged: 0, kept: 0, joined: true };
    },

    /** Créateur : le partage est effacé du relais pour tous. Sinon : on le quitte, la copie reste. */
    async stop(projectId: string) {
      const share = (await load())[projectId];
      if (!share) return;
      if (share.owner && !share.ended) await remoteShare(share, deps.fetch).remove();
      await leave(projectId);
    },

    /** Projet mis à la corbeille ici : arrêté pour tous s'il a été créé ici, sinon quitté. */
    async forget(projectId: string) {
      await this.stop(projectId).catch(() => leave(projectId));
    },
  };
}

class EndedError extends Error {}

const pickProject = ({ id, name, context, createdAt, updatedAt }: Project): Project => ({ id, name, context, createdAt, updatedAt });

export type Sync = ReturnType<typeof createSync>;
