// Projets partagés par lien, gardés dans R2 : des objets chiffrés par l'app, dont la clé reste dans le lien.
// Sans import de cloudflare:workers : testable avec node (share.test.ts, bucket en mémoire).

import { MAX_SHARE_BYTES, SHARE_DAYS } from '@pastille/shared/share';

async function sha256(text: string): Promise<string> {
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
  return [...hash].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Projet partagé : `<id>/index` et un objet par revue, chiffrés par l'app. Lecture libre (sans la clé, illisible),
 * écriture et effacement réservés au jeton du premier envoi (son empreinte est gardée sur l'index).
 * Un objet de plus de SHARE_DAYS jours n'est plus servi ; une règle de cycle de vie du bucket l'efface.
 */
export async function share(request: Request, bucket: R2Bucket, id: string, name: string | undefined): Promise<Response> {
  if (request.method === 'GET' && name) {
    const object = await bucket.get(`${id}/${name}`);
    if (!object || Date.now() - object.uploaded.getTime() > SHARE_DAYS * 86_400_000) return new Response('Lien expiré ou arrêté', { status: 404 });
    return new Response(object.body, { headers: { 'Content-Type': 'application/octet-stream', 'Cache-Control': 'no-store' } });
  }
  const owner = await sha256(request.headers.get('Authorization')?.replace(/^Bearer /, '') ?? '');
  const index = await bucket.head(`${id}/index`);
  if (index && index.customMetadata?.owner !== owner) return new Response('Refusé', { status: 403 });
  if (request.method === 'PUT' && name) {
    const length = Number(request.headers.get('Content-Length'));
    if (!request.body || !length) return new Response('Taille inconnue', { status: 411 });
    if (length > MAX_SHARE_BYTES) return new Response('Trop lourd', { status: 413 });
    await bucket.put(`${id}/${name}`, request.body, { customMetadata: { owner } });
    return new Response(null, { status: 204 });
  }
  if (request.method === 'DELETE' && !name) {
    if (!index) return new Response(null, { status: 404 });
    let cursor: string | undefined;
    do {
      const list = await bucket.list({ prefix: `${id}/`, cursor });
      if (list.objects.length) await bucket.delete(list.objects.map((o) => o.key));
      cursor = list.truncated ? list.cursor : undefined;
    } while (cursor);
    return new Response(null, { status: 204 });
  }
  return new Response(null, { status: 405 });
}
