import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { markDeleted, sessionContent, type Annotation, type Session } from '@pastille/shared';
import { createFakeSession } from './export/fixture.ts';
import { createSessionStore, type SessionStore } from './session-store.ts';
import { createSharing, sessionFiles } from './share.ts';
import { createSync, readLink, type Connect } from './sync.ts';

const RELAY = 'https://relay.test';

/** Relais en mémoire : objets chiffrés, versions (ETag) et écritures conditionnelles, comme le Worker. */
function memoryRelay() {
  const objects = new Map<string, { data: Uint8Array<ArrayBuffer>; etag: string }>();
  let version = 0;
  const writes: string[] = [];
  async function fetch(url: string, init: RequestInit): Promise<Response> {
    const path = new URL(url).pathname;
    const headers = new Headers(init.headers);
    if (init.method === 'PUT') {
      const current = objects.get(path);
      const ifMatch = headers.get('If-Match');
      if ((headers.get('If-None-Match') === '*' && current) || (ifMatch && current?.etag !== ifMatch)) return new Response(null, { status: 412 });
      const etag = `"v${++version}"`;
      objects.set(path, { data: new Uint8Array(init.body as Uint8Array), etag });
      writes.push(path);
      return new Response(null, { status: 204, headers: { ETag: etag } });
    }
    if (init.method === 'DELETE') {
      for (const key of [...objects.keys()]) if (key.startsWith(path + '/')) objects.delete(key);
      return new Response(null, { status: 204 });
    }
    const share = path.split('/').slice(0, 3).join('/');
    const object = objects.has(`${share}/index`) && objects.get(path);
    return object ? new Response(object.data, { headers: { ETag: object.etag } }) : new Response(null, { status: 404 });
  }
  return { objects, fetch, writes };
}

const quietRoom: Connect = () => ({ notify() {}, close() {} });
const machines: { sync: ReturnType<typeof createSync> }[] = [];
afterEach(() => machines.splice(0).forEach((m) => m.sync.close()));

async function machine(relay: ReturnType<typeof memoryRelay>) {
  const root = await mkdtemp(join(tmpdir(), 'pastille-sync-'));
  const store = createSessionStore(root);
  await store.restore();
  const trashed: string[] = [];
  const sync = createSync({
    store,
    dataDir: root,
    relay: RELAY,
    fetch: relay.fetch,
    connect: quietRoom,
    trash: async (dir) => {
      trashed.push(dir);
      await rm(dir, { recursive: true, force: true });
    },
  });
  const m = { root, store, sync, trashed, sharing: createSharing({ store }) };
  machines.push(m);
  return m;
}

/** Revue fermée modifiée sur le disque, comme le ferait l'éditeur. */
async function edit(store: SessionStore, id: string, change: (s: Session) => void) {
  const s = await store.readSession(id);
  change(s);
  s.updatedAt = new Date(Date.parse(s.updatedAt) + 1000).toISOString();
  await store.writeSession(s);
}

const point = (id: string, text: string): Annotation => {
  const now = new Date().toISOString();
  return { id, number: 0, geometry: { kind: 'point', x: 0.2, y: 0.2 }, text, input: 'typed', transcription: 'none', sketches: [], createdAt: now, updatedAt: now };
};

/** Une revue factice rangée dans le projet en cours. */
async function review(store: SessionStore, points = 4) {
  const { session } = await createFakeSession(store.sessionsDir, points);
  await edit(store, session.id, (s) => (s.projectId = undefined)); // rangée par défaut dans le premier projet
  return session.id;
}

describe('projet partagé synchronisé', () => {
  it('le relais ne garde que du chiffré : revue, fichiers à part, index', async () => {
    const relay = memoryRelay();
    const a = await machine(relay);
    const project = await a.store.currentProject();
    const id = await review(a.store);
    const view = await a.sync.create(project.id);
    expect(view).toMatchObject({ owner: true, status: 'synced' });
    expect(view.collab).toMatch(/^https:\/\/relay\.test\/view#s=[\w-]+&k=[\w-]+&t=[\w-]+$/);
    expect(view.read).toBe(view.collab.replace(/&t=.*$/, ''));
    const files = sessionFiles(await a.store.readSession(id), { audio: false });
    expect(relay.objects.size).toBe(files.length + 2); // fichiers, revue, index
    for (const { data } of relay.objects.values()) expect(Buffer.from(data).toString('latin1')).not.toMatch(/Revue|PNG|session|Tableau/);
  });

  it('chacun voit les modifications de l’autre, fusionnées point par point, puis tout se calme', async () => {
    const relay = memoryRelay();
    const a = await machine(relay);
    const project = await a.store.currentProject();
    const id = await review(a.store);
    const { collab } = await a.sync.create(project.id);

    const b = await machine(relay);
    expect(await b.sync.join(collab)).toMatchObject({ projectId: project.id, added: 1, joined: true });
    expect(sessionContent(await b.store.readSession(id))).toBe(sessionContent(await a.store.readSession(id)));
    for (const f of sessionFiles(await b.store.readSession(id), { audio: false })) expect(existsSync(join(b.store.sessionsDir, id, f))).toBe(true);

    // Même écran, un point ajouté de chaque côté en même temps
    await edit(a.store, id, (s) => s.captures[0]!.annotations.push(point('pa', 'vu par A')));
    await edit(b.store, id, (s) => s.captures[0]!.annotations.push(point('pb', 'vu par B')));
    await a.sync.now(project.id);
    await b.sync.now(project.id);
    await a.sync.now(project.id);
    const left = await a.store.readSession(id), right = await b.store.readSession(id);
    expect(left.captures[0]!.annotations.map((x) => x.id)).toEqual(expect.arrayContaining(['pa', 'pb']));
    expect(sessionContent(left)).toBe(sessionContent(right));

    // Plus rien à échanger : aucune écriture de plus
    const writes = relay.writes.length;
    await a.sync.now(project.id);
    await b.sync.now(project.id);
    expect(relay.writes.length).toBe(writes);

    // Un point supprimé d'un côté disparaît de l'autre
    await edit(b.store, id, (s) => {
      for (const c of s.captures) c.annotations = c.annotations.filter((x) => x.id !== 'pa');
      markDeleted(s, 'pa');
    });
    await b.sync.now(project.id);
    await a.sync.now(project.id);
    expect((await a.store.readSession(id)).captures[0]!.annotations.map((x) => x.id)).not.toContain('pa');
  });

  it('revues ajoutées et retirées, projet renommé : visibles partout', async () => {
    const relay = memoryRelay();
    const a = await machine(relay);
    const project = await a.store.currentProject();
    const first = await review(a.store, 1);
    const { collab } = await a.sync.create(project.id);
    const b = await machine(relay);
    await b.sync.join(collab);

    const second = await review(b.store, 1);
    await b.store.moveSession(second, project.id);
    await b.sync.now(project.id);
    await a.sync.now(project.id);
    expect((await a.store.listProjects()).find((p) => p.id === project.id)!.sessions.map((s) => s.id).sort()).toEqual([first, second].sort());

    await rm(a.store.dir({ id: first }), { recursive: true });
    await a.store.updateProject(project.id, { name: 'Site client' });
    await a.sync.now(project.id);
    await b.sync.now(project.id);
    expect(b.trashed).toEqual([b.store.dir({ id: first })]);
    expect((await b.store.projects()).find((p) => p.id === project.id)!.name).toBe('Site client');
  });

  it('la revue ouverte reçoit les changements sans perdre son annulation', async () => {
    const relay = memoryRelay();
    const a = await machine(relay);
    const project = await a.store.currentProject();
    const id = await review(a.store, 1);
    const { collab } = await a.sync.create(project.id);
    const b = await machine(relay);
    await b.sync.join(collab);

    await b.store.open(id);
    b.store.update((s) => (s.name = 'Renommée ici'), { undoable: true });
    await edit(a.store, id, (s) => s.captures[1]!.annotations.push(point('pa', 'vu par A')));
    await a.sync.now(project.id);
    await b.sync.now(project.id);
    expect(b.store.get()!.captures[1]!.annotations.map((x) => x.id)).toContain('pa');
    b.store.undo();
    expect(b.store.get()!.name).not.toBe('Renommée ici');
    expect(b.store.get()!.captures[1]!.annotations.map((x) => x.id)).toContain('pa');
  });

  it('arrêté par son créateur : le partage disparaît du relais, les copies restent', async () => {
    const relay = memoryRelay();
    const a = await machine(relay);
    const project = await a.store.currentProject();
    const id = await review(a.store, 1);
    const { collab, read } = await a.sync.create(project.id);
    const b = await machine(relay);
    await b.sync.join(collab);

    // Lien de lecture : une simple copie, qui ne se synchronise pas
    const c = await machine(relay);
    expect(await c.sharing.importSource(await readLink(read, relay.fetch))).toMatchObject({ added: 1 });
    expect(c.sync.isShared(project.id)).toBe(false);

    await a.sync.stop(project.id);
    expect(relay.objects.size).toBe(0);
    expect(await a.sync.view(project.id)).toBeUndefined();
    await b.sync.now(project.id);
    expect((await b.sync.view(project.id))?.status).toBe('ended');
    expect(existsSync(join(b.store.sessionsDir, id, 'session.json'))).toBe(true);
    await expect(readLink(read, relay.fetch)).rejects.toThrow(/30/);
  });

  it('un lien créé par la 0.16 passe au format en ligne actuel et reste au créateur', async () => {
    const relay = memoryRelay();
    const a = await machine(relay);
    const project = await a.store.currentProject();
    await review(a.store, 1);
    const old = { relay: RELAY, id: 'OLDOLDOLDOLDOLDOLDOLDO', key: 'A'.repeat(43), token: 'jeton', sharedAt: new Date().toISOString() };
    await writeFile(join(a.root, 'shares.json'), JSON.stringify({ [project.id]: old }));
    const fresh = createSync({ store: a.store, dataDir: a.root, relay: RELAY, fetch: relay.fetch, connect: quietRoom, trash: async () => {} });
    machines.push({ sync: fresh });
    await fresh.now(project.id);
    expect(await fresh.view(project.id)).toMatchObject({ owner: true, status: 'synced' });
    expect(JSON.parse(await readFile(join(a.root, 'shares.json'), 'utf8'))[project.id].format).toBe(2);
  });
});
