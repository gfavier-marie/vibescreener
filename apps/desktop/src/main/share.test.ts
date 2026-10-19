import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createFakeSession } from './export/fixture.ts';
import { createSessionStore } from './session-store.ts';
import { createSharing, sessionFiles, ShareError } from './share.ts';

async function machine() {
  const root = await mkdtemp(join(tmpdir(), 'pastille-share-'));
  const store = createSessionStore(root);
  await store.restore();
  return { root, store, sharing: createSharing({ store }) };
}

/** Revue fermée modifiée sur le disque, une minute plus tard. */
async function touch(store: ReturnType<typeof createSessionStore>, id: string, name: string) {
  const s = await store.readSession(id);
  await store.writeSession({ ...s, name, updatedAt: new Date(Date.parse(s.updatedAt) + 60_000).toISOString() });
}

describe('partage des projets par fichier', () => {
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
});
