import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createFakeSession } from './export/fixture.ts';
import { createSessionStore } from './session-store.ts';
import { createSharing, sessionFiles, ShareError } from './share.ts';

const RELAY = 'https://relay.test';

/** Relais en mémoire : PUT, GET et DELETE de /share/… (les droits du jeton sont testés avec le relais lui-même). */
function memoryRelay() {
  const objects = new Map<string, Uint8Array<ArrayBuffer>>();
  async function fetch(url: string, init: RequestInit): Promise<Response> {
    const path = new URL(url).pathname;
    if (init.method === 'PUT') {
      objects.set(path, new Uint8Array(init.body as Uint8Array));
      return new Response(null, { status: 204 });
    }
    if (init.method === 'DELETE') {
      for (const key of [...objects.keys()]) if (key.startsWith(path + '/')) objects.delete(key);
      return new Response(null, { status: 204 });
    }
    const data = objects.get(path);
    return data ? new Response(data) : new Response(null, { status: 404 });
  }
  return { objects, fetch };
}

async function machine(relay = memoryRelay()) {
  const root = await mkdtemp(join(tmpdir(), 'pastille-share-'));
  const store = createSessionStore(root);
  await store.restore();
  return { root, store, sharing: createSharing({ store, dataDir: root, relay: RELAY, fetch: relay.fetch }) };
}

/** Revue fermée modifiée sur le disque, une minute plus tard. */
async function touch(store: ReturnType<typeof createSessionStore>, id: string, name: string) {
  const s = await store.readSession(id);
  await store.writeSession({ ...s, name, updatedAt: new Date(Date.parse(s.updatedAt) + 60_000).toISOString() });
}

describe('partage des projets', () => {
  it('fichier : le projet, ses revues et leurs images passent sur un autre ordinateur, puis se complètent', async () => {
    const a = await machine();
    const project = await a.store.currentProject();
    await a.store.updateProject(project.id, { name: 'Site client', context: 'Next.js, page Tarifs' });
    const { session } = await createFakeSession(a.store.sessionsDir);
    const file = join(a.root, 'site-client.vibescreener');
    await a.sharing.exportFile(project.id, file);

    const b = await machine();
    expect(await b.sharing.importFile(file)).toMatchObject({ projectId: project.id, name: 'Site client', added: 1, updated: 0 });
    const imported = (await b.store.listProjects()).find((p) => p.id === project.id)!;
    expect(imported).toMatchObject({ name: 'Site client', context: 'Next.js, page Tarifs' });
    expect(imported.sessions.map((s) => s.id)).toEqual([session.id]);
    for (const f of sessionFiles(session)) expect(existsSync(join(b.store.sessionsDir, session.id, f))).toBe(true);
    expect(b.store.contextOf(await b.store.readSession(session.id))).toBe('Next.js, page Tarifs');

    // Même fichier : rien ne change ; revue modifiée ici : gardée ; modifiée là-bas ensuite : remplacée.
    expect(await b.sharing.importFile(file)).toMatchObject({ added: 0, unchanged: 1 });
    await touch(b.store, session.id, 'Revue relue ici');
    expect(await b.sharing.importFile(file)).toMatchObject({ kept: 1 });
    expect((await b.store.readSession(session.id)).name).toBe('Revue relue ici');
    const later = await b.store.readSession(session.id);
    await a.store.writeSession({ ...(await a.store.readSession(session.id)), name: 'Revue corrigée', updatedAt: new Date(Date.parse(later.updatedAt) + 60_000).toISOString() });
    await a.sharing.exportFile(project.id, file);
    expect(await b.sharing.importFile(file)).toMatchObject({ updated: 1 });
    expect((await b.store.readSession(session.id)).name).toBe('Revue corrigée');
  });

  it("une dictée en attente chez l'autre arrive avec son audio, à réessayer", async () => {
    const a = await machine();
    const { session, dir } = await createFakeSession(a.store.sessionsDir);
    const point = session.captures[0]!.annotations[1]!;
    Object.assign(point, { transcription: 'pending', audio: 'audio/point.wav' });
    await mkdir(join(dir, 'audio'), { recursive: true });
    await writeFile(join(dir, 'audio/point.wav'), new Uint8Array([1, 2]));
    await writeFile(join(dir, 'session.json'), JSON.stringify(session));
    const file = join(a.root, 'p.vibescreener');
    await a.sharing.exportFile((await a.store.currentProject()).id, file);

    const b = await machine();
    await b.sharing.importFile(file);
    const received = await b.store.readSession(session.id);
    expect(received.captures[0]!.annotations[1]).toMatchObject({ transcription: 'error', audio: 'audio/point.wav' });
    expect(existsSync(join(b.store.sessionsDir, session.id, 'audio/point.wav'))).toBe(true);
  });

  it("refuse un fichier qui n'est pas un projet", async () => {
    const b = await machine();
    const file = join(b.root, 'faux.vibescreener');
    await writeFile(file, 'pas un zip');
    await expect(b.sharing.importFile(file)).rejects.toBeInstanceOf(ShareError);
  });

  it('lien : chiffré sur le relais, importable, mis à jour au même lien, puis arrêté', async () => {
    const relay = memoryRelay();
    const a = await machine(relay);
    const project = await a.store.currentProject();
    const { session } = await createFakeSession(a.store.sessionsDir);
    const progress: number[] = [];
    const link = await a.sharing.publish(project.id, (done) => progress.push(done));
    expect(link.url).toMatch(/^https:\/\/relay\.test\/view#s=[\w-]+&k=[\w-]+$/);
    expect(progress).toEqual([0, 1, 2]);
    expect([...relay.objects.keys()].map((k) => k.split('/').pop()).sort()).toEqual(['index', session.id].sort());
    // Le relais ne voit que du chiffré : ni le nom de la revue, ni le PNG.
    for (const data of relay.objects.values()) expect(Buffer.from(data).toString('latin1')).not.toMatch(/Revue|PNG|session\.json/);

    const b = await machine(relay);
    expect(await b.sharing.importLink(link.url)).toMatchObject({ projectId: project.id, added: 1 });
    expect((await b.store.readSession(session.id)).captures).toHaveLength(5);

    await touch(a.store, session.id, 'Revue corrigée');
    expect((await a.sharing.publish(project.id)).url).toBe(link.url);
    expect(await b.sharing.importLink(link.url)).toMatchObject({ updated: 1 });

    const wrongKey = link.url.replace(/k=[\w-]+/, `k=${'A'.repeat(43)}`);
    await expect(b.sharing.importLink(wrongKey)).rejects.toThrow(ShareError);
    await expect(b.sharing.importLink('https://exemple.fr/page')).rejects.toThrow(ShareError);

    await a.sharing.revoke(project.id);
    expect(relay.objects.size).toBe(0);
    expect(await a.sharing.link(project.id)).toBeUndefined();
    await expect(b.sharing.importLink(link.url)).rejects.toThrow(/30/);
  });

  it("le jeton d'un lien reste sur l'ordinateur, hors du fichier partagé", async () => {
    const a = await machine();
    const project = await a.store.currentProject();
    await createFakeSession(a.store.sessionsDir, 1);
    await a.sharing.publish(project.id);
    const shares = JSON.parse(await readFile(join(a.root, 'shares.json'), 'utf8')) as Record<string, { token: string }>;
    const file = join(a.root, 'p.vibescreener');
    await a.sharing.exportFile(project.id, file);
    expect((await readFile(file)).toString('latin1')).not.toContain(shares[project.id]!.token);
  });
});
