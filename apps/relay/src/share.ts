// Projets partagés, gardés dans R2 : des objets chiffrés par l'app, dont la clé reste dans les liens.
// Sans import de cloudflare:workers : testable avec node (share.test.ts, bucket en mémoire).

import { MAX_SHARE_BYTES, SHARE_DAYS } from '@pastille/shared/share';

const DAY_MS = 86_400_000;

async function sha256(text: string): Promise<string> {
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
  return [...hash].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Un partage vit tant que son index a moins de SHARE_DAYS jours : l'app le réécrit à chaque modification. */
const fresh = (index: { uploaded: Date } | null, now: number) => !!index && now - index.uploaded.getTime() <= SHARE_DAYS * DAY_MS;

/**
 * Projet partagé : `<id>/index`, un objet par revue et un par fichier, chiffrés par l'app. Lecture libre
 * (sans la clé, illisible), écriture et effacement réservés au jeton du premier envoi, que portent le
 * créateur et les liens de collaboration (son empreinte est gardée sur chaque objet).
 * Écriture conditionnelle : If-Match (version connue) ou If-None-Match: * (création), sinon 412 ;
 * deux personnes qui modifient la même revue ne s'écrasent pas, la seconde fusionne puis réessaie.
 */
export async function share(request: Request, bucket: R2Bucket, id: string, name: string | undefined, now = Date.now()): Promise<Response> {
  const index = await bucket.head(`${id}/index`);
  if (request.method === 'GET' && name) {
    const object = fresh(index, now) ? await bucket.get(`${id}/${name}`) : null;
    if (!object) return new Response('Lien expiré ou arrêté', { status: 404 });
    return new Response(object.body, { headers: { 'Content-Type': 'application/octet-stream', 'Cache-Control': 'no-store', ETag: object.httpEtag } });
  }
  const owner = await sha256(request.headers.get('Authorization')?.replace(/^Bearer /, '') ?? '');
  if (index && index.customMetadata?.owner !== owner) return new Response('Refusé', { status: 403 });
  if (request.method === 'PUT' && name) {
    const length = Number(request.headers.get('Content-Length'));
    if (!request.body || !length) return new Response('Taille inconnue', { status: 411 });
    if (length > MAX_SHARE_BYTES) return new Response('Trop lourd', { status: 413 });
    const key = `${id}/${name}`;
    const ifMatch = request.headers.get('If-Match')?.replace(/^W\//, '').replaceAll('"', '');
    if (request.headers.get('If-None-Match') === '*' && (await bucket.head(key))) return new Response('Déjà là', { status: 412 });
    const written = await bucket.put(key, request.body, { customMetadata: { owner }, ...(ifMatch && { onlyIf: { etagMatches: ifMatch } }) });
    if (!written) return new Response('Modifié entre-temps', { status: 412 });
    return new Response(null, { status: 204, headers: { ETag: written.httpEtag } });
  }
  if (request.method === 'DELETE' && !name) {
    if (!index) return new Response(null, { status: 404 });
    await removeAll(bucket, id);
    return new Response(null, { status: 204 });
  }
  return new Response(null, { status: 405 });
}

async function removeAll(bucket: R2Bucket, id: string) {
  let cursor: string | undefined;
  do {
    const list = await bucket.list({ prefix: `${id}/`, cursor });
    if (list.objects.length) await bucket.delete(list.objects.map((o) => o.key));
    cursor = list.truncated ? list.cursor : undefined;
  } while (cursor);
}

/**
 * Tâche planifiée (une fois par jour) : efface les partages restés SHARE_DAYS jours sans modification,
 * et les envois commencés sans index depuis plus d'un jour.
 */
export async function cleanup(bucket: R2Bucket, now = Date.now()) {
  let cursor: string | undefined;
  do {
    const list = await bucket.list({ delimiter: '/', cursor });
    for (const prefix of list.delimitedPrefixes) {
      const id = prefix.slice(0, -1);
      const index = await bucket.head(`${id}/index`);
      if (fresh(index, now)) continue;
      if (!index) {
        const objects = await bucket.list({ prefix });
        if (objects.objects.some((o) => now - o.uploaded.getTime() < DAY_MS)) continue; // envoi en cours
      }
      await removeAll(bucket, id);
    }
    cursor = list.truncated ? list.cursor : undefined;
  } while (cursor);
}
