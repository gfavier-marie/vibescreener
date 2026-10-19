import { describe, expect, it } from 'vitest';
import { SHARE_DAYS } from '@pastille/shared/share';
import { share } from './share.ts';

type Stored = { data: Uint8Array; owner?: string; uploaded: Date };

/** Bucket R2 en mémoire : seulement ce que le relais utilise. */
function memoryBucket() {
  const objects = new Map<string, Stored>();
  const bucket = {
    async get(key: string) {
      const o = objects.get(key);
      return o && { body: o.data, uploaded: o.uploaded };
    },
    async head(key: string) {
      const o = objects.get(key);
      return o && { customMetadata: { owner: o.owner }, uploaded: o.uploaded };
    },
    async put(key: string, body: ReadableStream, opts: { customMetadata: { owner: string } }) {
      objects.set(key, { data: new Uint8Array(await new Response(body).arrayBuffer()), owner: opts.customMetadata.owner, uploaded: new Date() });
    },
    async delete(keys: string[]) {
      for (const k of keys) objects.delete(k);
    },
    async list({ prefix }: { prefix: string }) {
      return { objects: [...objects.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })), truncated: false };
    },
  };
  return { objects, bucket: bucket as unknown as R2Bucket };
}

const ID = 'AAAAAAAAAAAAAAAAAAAAAA';
const put = (bucket: R2Bucket, name: string, token: string, data = new Uint8Array([1, 2, 3])) =>
  share(
    new Request(`https://relay.test/share/${ID}/${name}`, {
      method: 'PUT',
      body: data,
      headers: { Authorization: `Bearer ${token}`, 'Content-Length': String(data.length) },
    }),
    bucket,
    ID,
    name,
  );
const get = (bucket: R2Bucket, name: string) => share(new Request(`https://relay.test/share/${ID}/${name}`), bucket, ID, name);
const del = (bucket: R2Bucket, token: string) =>
  share(new Request(`https://relay.test/share/${ID}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }), bucket, ID, undefined);

describe('relais : projets partagés', () => {
  it('garde les objets du premier envoi et les sert à qui a le lien', async () => {
    const { bucket } = memoryBucket();
    expect((await put(bucket, 'revue1', 'jeton')).status).toBe(204);
    expect((await put(bucket, 'index', 'jeton')).status).toBe(204);
    const res = await get(bucket, 'revue1');
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
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

  it('refuse un envoi sans taille et ne sert plus un lien expiré', async () => {
    const { bucket, objects } = memoryBucket();
    const noLength = new Request(`https://relay.test/share/${ID}/index`, { method: 'PUT', body: new Uint8Array([1]), headers: { Authorization: 'Bearer jeton' } });
    expect((await share(noLength, bucket, ID, 'index')).status).toBe(411);
    await put(bucket, 'index', 'jeton');
    objects.get(`${ID}/index`)!.uploaded = new Date(Date.now() - (SHARE_DAYS + 1) * 86_400_000);
    expect((await get(bucket, 'index')).status).toBe(404);
  });
});
