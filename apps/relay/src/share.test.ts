import { describe, expect, it } from 'vitest';
import { SHARE_DAYS } from '@pastille/shared/share';
import { cleanup, share } from './share.ts';

type Stored = { data: Uint8Array; owner?: string; uploaded: Date; etag: string };

/** Bucket R2 en mémoire : seulement ce que le relais utilise. */
function memoryBucket() {
  const objects = new Map<string, Stored>();
  let version = 0;
  const view = (o: Stored) => ({ customMetadata: { owner: o.owner }, uploaded: o.uploaded, etag: o.etag, httpEtag: `"${o.etag}"` });
  const bucket = {
    async get(key: string) {
      const o = objects.get(key);
      return o && { ...view(o), body: o.data };
    },
    async head(key: string) {
      const o = objects.get(key);
      return o ? view(o) : null;
    },
    async put(key: string, body: ReadableStream, opts: { customMetadata: { owner: string }; onlyIf?: { etagMatches: string } }) {
      if (opts.onlyIf && objects.get(key)?.etag !== opts.onlyIf.etagMatches) return null;
      const o = { data: new Uint8Array(await new Response(body).arrayBuffer()), owner: opts.customMetadata.owner, uploaded: new Date(), etag: `v${++version}` };
      objects.set(key, o);
      return view(o);
    },
    async delete(keys: string[]) {
      for (const k of keys) objects.delete(k);
    },
    async list({ prefix = '', delimiter }: { prefix?: string; delimiter?: string }) {
      const keys = [...objects.keys()].filter((k) => k.startsWith(prefix));
      return {
        objects: keys.map((key) => ({ key, uploaded: objects.get(key)!.uploaded })),
        delimitedPrefixes: delimiter ? [...new Set(keys.map((k) => k.slice(0, k.indexOf(delimiter) + 1)))] : [],
        truncated: false,
      };
    },
  };
  return { objects, bucket: bucket as unknown as R2Bucket };
}

const ID = 'AAAAAAAAAAAAAAAAAAAAAA';
const put = (bucket: R2Bucket, name: string, token: string, headers: Record<string, string> = {}, data = new Uint8Array([1, 2, 3])) =>
  share(
    new Request(`https://relay.test/share/${ID}/${name}`, {
      method: 'PUT',
      body: data,
      headers: { Authorization: `Bearer ${token}`, 'Content-Length': String(data.length), ...headers },
    }),
    bucket,
    ID,
    name,
  );
const get = (bucket: R2Bucket, name: string) => share(new Request(`https://relay.test/share/${ID}/${name}`), bucket, ID, name);
const del = (bucket: R2Bucket, token: string) =>
  share(new Request(`https://relay.test/share/${ID}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }), bucket, ID, undefined);
const age = (objects: Map<string, Stored>, key: string, days: number) => (objects.get(key)!.uploaded = new Date(Date.now() - days * 86_400_000));

describe('relais : projets partagés', () => {
  it('garde les objets du premier envoi et les sert à qui a le lien, avec leur version', async () => {
    const { bucket } = memoryBucket();
    expect((await put(bucket, 'revue1', 'jeton')).status).toBe(204);
    expect((await get(bucket, 'revue1')).status).toBe(404); // pas encore d'index
    expect((await put(bucket, 'index', 'jeton')).status).toBe(204);
    const res = await get(bucket, 'revue1');
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(res.headers.get('ETag')).toBe('"v1"');
    expect([...new Uint8Array(await res.arrayBuffer())]).toEqual([1, 2, 3]);
    expect((await get(bucket, 'absente')).status).toBe(404);
  });

  it('seul le jeton du premier envoi met à jour ou arrête le partage', async () => {
    const { bucket, objects } = memoryBucket();
    await put(bucket, 'revue1', 'jeton');
    await put(bucket, 'index', 'jeton');
    expect((await put(bucket, 'index', 'autre')).status).toBe(403);
    expect((await put(bucket, 'revue2', 'autre')).status).toBe(403);
    expect((await del(bucket, 'autre')).status).toBe(403);
    expect((await put(bucket, 'revue2', 'jeton')).status).toBe(204);
    expect((await del(bucket, 'jeton')).status).toBe(204);
    expect(objects.size).toBe(0);
    expect((await get(bucket, 'index')).status).toBe(404);
  });

  it('écriture conditionnelle : la version connue, ou la création seulement', async () => {
    const { bucket } = memoryBucket();
    await put(bucket, 'index', 'jeton');
    const first = await put(bucket, 'revue1', 'jeton', { 'If-None-Match': '*' });
    expect(first.status).toBe(204);
    const etag = first.headers.get('ETag')!;
    expect((await put(bucket, 'revue1', 'jeton', { 'If-None-Match': '*' })).status).toBe(412);
    expect((await put(bucket, 'revue1', 'jeton', { 'If-Match': etag })).status).toBe(204);
    // Quelqu'un d'autre a écrit entre-temps : l'ancienne version ne passe plus.
    expect((await put(bucket, 'revue1', 'jeton', { 'If-Match': etag })).status).toBe(412);
  });

  it('refuse un envoi sans taille ; un partage sans modification depuis trop longtemps n’est plus servi, puis effacé', async () => {
    const { bucket, objects } = memoryBucket();
    const noLength = new Request(`https://relay.test/share/${ID}/index`, { method: 'PUT', body: new Uint8Array([1]), headers: { Authorization: 'Bearer jeton' } });
    expect((await share(noLength, bucket, ID, 'index')).status).toBe(411);
    await put(bucket, 'revue1', 'jeton');
    await put(bucket, 'index', 'jeton');
    age(objects, `${ID}/revue1`, SHARE_DAYS + 10); // fichier ancien d'un projet actif : gardé
    await cleanup(bucket);
    expect((await get(bucket, 'revue1')).status).toBe(200);
    age(objects, `${ID}/index`, SHARE_DAYS + 1);
    expect((await get(bucket, 'revue1')).status).toBe(404);
    await cleanup(bucket);
    expect(objects.size).toBe(0);
  });

  it('le nettoyage laisse un envoi en cours, efface un envoi abandonné', async () => {
    const { bucket, objects } = memoryBucket();
    await put(bucket, 'revue1', 'jeton');
    await cleanup(bucket);
    expect(objects.size).toBe(1);
    age(objects, `${ID}/revue1`, 2);
    await cleanup(bucket);
    expect(objects.size).toBe(0);
  });
});
