import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { findAnnotation, newSession, type Session } from '@pastille/shared';
import { createSessionStore } from './session-store.ts';

const meta = { width: 200, height: 100, scaleFactor: 2 };
const point = (x: number) => ({
  id: crypto.randomUUID(),
  number: 0,
  geometry: { kind: 'point' as const, x, y: 0.5 },
  text: `retour ${x}`,
  input: 'typed' as const,
  transcription: 'none' as const,
  sketches: [],
  createdAt: '',
  updatedAt: '',
});

describe('stockage des sessions', () => {
  it('crée la session à la première capture et la rouvre intacte', async () => {
    const root = await mkdtemp(join(tmpdir(), 'pastille-'));
    const store = createSessionStore(root);
    expect(await store.restore()).toBeNull();

    const capture = await store.addCapture(new Uint8Array([1, 2, 3]), meta);
    store.update((s) => s.captures[0]!.annotations.push(point(0.1), point(0.2)));
    store.update((s) => (s.context = 'Back-office, React'));
    const session = store.get()!;
    expect(session.name).toMatch(/^Revue \d{4}-\d{2}-\d{2} \d{2}h\d{2}$/);
    expect(existsSync(join(store.dir(session), capture.image))).toBe(true);

    await store.flush();
    // Redémarrage : un nouveau store relit la même session.
    const again = createSessionStore(root);
    const restored = (await again.restore())!;
    expect(restored.id).toBe(session.id);
    expect(restored.captures[0]!.annotations.map((a) => a.number)).toEqual([1, 2]);
  });

  it('écrit de façon atomique avec anti-rebond', async () => {
    const root = await mkdtemp(join(tmpdir(), 'pastille-'));
    const store = createSessionStore(root);
    await store.addCapture(new Uint8Array([0]), meta);
    for (let i = 0; i < 20; i++) store.update((s) => (s.name = `nom ${i}`));
    await new Promise((r) => setTimeout(r, 400));
    const file = join(store.dir(store.get()!), 'session.json');
    expect((JSON.parse(await readFile(file, 'utf8')) as Session).name).toBe('nom 19');
    expect(existsSync(file + '.tmp')).toBe(false);
  });

  it('une session prend le contexte de son projet, même modifié après coup', async () => {
    const root = await mkdtemp(join(tmpdir(), 'pastille-'));
    const store = createSessionStore(root, { legacyContext: () => 'Site vitrine' });
    const first = await store.ensure();
    expect(store.contextOf(first)).toBe('Site vitrine');
    await store.updateProject(first.projectId!, { context: 'Back-office' });
    expect(store.contextOf(first)).toBe('Back-office');
    await store.close();
    expect(store.get()).toBeNull();
    const next = await store.ensure();
    expect(next.id).not.toBe(first.id);
    expect(next.projectId).toBe(first.projectId);
  });
});

describe('annuler / rétablir', () => {
  it('annule une étape, regroupe la frappe, garde les captures et les transcriptions', async () => {
    const root = await mkdtemp(join(tmpdir(), 'pastille-'));
    const store = createSessionStore(root);
    await store.addCapture(new Uint8Array([0]), meta);
    const a = point(0.1);
    store.update((s) => s.captures[0]!.annotations.push({ ...a, text: '' }), { undoable: true });
    for (const text of ['b', 'bo', 'bou']) {
      store.update((s) => (s.captures[0]!.annotations[0]!.text = text), { undoable: true, coalesceKey: `text:${a.id}` });
    }
    await store.addCapture(new Uint8Array([0]), meta); // non annulable
    // Comme le vrai code : on cherche l'annotation par id, absente de certains états de l'historique.
    store.update((s) => {
      const found = findAnnotation(s, a.id);
      if (found) found.annotation.transcription = 'done';
    }, { patchHistory: true });

    store.undo(); // toute la frappe d'un coup
    expect(store.get()!.captures[0]!.annotations[0]!.text).toBe('');
    expect(store.get()!.captures).toHaveLength(2);
    expect(store.get()!.captures[0]!.annotations[0]!.transcription).toBe('done');
    store.undo(); // le point
    expect(store.get()!.captures[0]!.annotations).toHaveLength(0);
    store.redo();
    store.redo();
    expect(store.get()!.captures[0]!.annotations[0]!.text).toBe('bou');
  });

  it('un point vide retiré par Échap ne revient pas avec ⌘Z', async () => {
    const root = await mkdtemp(join(tmpdir(), 'pastille-'));
    const store = createSessionStore(root);
    await store.addCapture(new Uint8Array([0]), meta);
    const a = point(0.1);
    const empty = { ...point(0.2), text: '' };
    store.update((s) => s.captures[0]!.annotations.push(a), { undoable: true });
    store.update((s) => s.captures[0]!.annotations.push(empty), { undoable: true });
    for (const text of ['x', '']) {
      store.update((s) => (findAnnotation(s, empty.id)!.annotation.text = text), { undoable: true, coalesceKey: `text:${empty.id}` });
    }
    await store.addCapture(new Uint8Array([0]), meta); // non annulable, gardé

    store.discard(empty.id);
    expect(store.get()!.captures[0]!.annotations.map((x) => x.id)).toEqual([a.id]);
    store.undo(); // directement avant le point a : le point vide n'existe plus nulle part
    expect(store.get()!.captures[0]!.annotations).toHaveLength(0);
    expect(store.get()!.captures).toHaveLength(2);
    store.redo();
    expect(store.get()!.captures[0]!.annotations.map((x) => x.id)).toEqual([a.id]);
    store.redo(); // plus rien à rétablir
    expect(store.get()!.captures[0]!.annotations.map((x) => x.id)).toEqual([a.id]);
  });
});

describe('inspirations', () => {
  it('joint une image à un point, annulable, et ignore un point disparu', async () => {
    const root = await mkdtemp(join(tmpdir(), 'pastille-'));
    const store = createSessionStore(root);
    await store.addCapture(new Uint8Array([0]), meta);
    const a = point(0.1);
    store.update((s) => s.captures[0]!.annotations.push(a));
    await store.addInspiration(a.id, new Uint8Array([1, 2]), { app: 'Google Chrome', windowTitle: 'Tarifs' });
    const [inspiration] = store.get()!.captures[0]!.annotations[0]!.inspirations!;
    expect(inspiration).toMatchObject({ image: `inspirations/${inspiration!.id}.png`, source: { app: 'Google Chrome' } });
    expect(existsSync(join(store.dir(store.get()!), inspiration!.image))).toBe(true);
    store.undo();
    expect(store.get()!.captures[0]!.annotations[0]!.inspirations).toBeUndefined();
    await store.addInspiration('inconnu', new Uint8Array([1]));
    expect(store.get()!.captures[0]!.annotations[0]!.inspirations).toBeUndefined();
  });
});

describe('sessions récentes', () => {
  it('liste les sessions et en rouvre une', async () => {
    const root = await mkdtemp(join(tmpdir(), 'pastille-'));
    const store = createSessionStore(root);
    await store.ensure();
    store.update((s) => (s.name = 'Ancienne'));
    const first = store.get()!.id;
    await store.close();
    await store.ensure();
    store.update((s) => (s.name = 'Récente'));
    await store.flush();
    const recent = await store.recent();
    expect(recent.map((r) => r.name)).toEqual(['Récente', 'Ancienne']);
    expect(recent[0]).toMatchObject({ points: 0, screens: 0 });
    await store.open(first);
    expect(store.get()!.name).toBe('Ancienne');
  });
});

describe('projets', () => {
  it('range les sessions existantes dans un premier projet, avec le contexte réglé jusque-là', async () => {
    const root = await mkdtemp(join(tmpdir(), 'pastille-'));
    const old = newSession(new Date(2026, 9, 1));
    await mkdir(join(root, 'sessions', old.id), { recursive: true });
    await writeFile(join(root, 'sessions', old.id, 'session.json'), JSON.stringify(old));
    const store = createSessionStore(root, { legacyContext: () => 'Back-office React' });
    await store.restore();
    const [first] = await store.projects();
    expect(first).toMatchObject({ name: 'Mes revues', context: 'Back-office React' });
    expect((await store.readSession(old.id)).projectId).toBe(first!.id);
    // Au lancement suivant, rien n'est refait.
    const again = createSessionStore(root, { legacyContext: () => 'autre' });
    await again.restore();
    expect(await again.projects()).toEqual([first]);
  });

  it('crée la revue dans le projet choisi, la range ailleurs et regroupe les revues par projet', async () => {
    const root = await mkdtemp(join(tmpdir(), 'pastille-'));
    const store = createSessionStore(root);
    const a = await store.ensure();
    const client = await store.createProject('Site client');
    await store.startIn(client.id);
    const b = await store.ensure();
    expect(b.projectId).toBe(client.id);
    expect(a.projectId).not.toBe(client.id);
    await store.flush();
    let list = await store.listProjects();
    expect(list.find((p) => p.id === client.id)).toMatchObject({ current: true, sessions: [{ id: b.id }] });

    await store.moveSession(a.id, client.id);
    list = await store.listProjects();
    expect(list.find((p) => p.id === client.id)!.sessions.map((s) => s.id).sort()).toEqual([a.id, b.id].sort());
    expect(list.find((p) => p.id !== client.id)!.sessions).toEqual([]);

    // Revue ouverte d'un autre projet : il devient le projet en cours.
    await store.open(a.id);
    expect((await store.currentProject()).id).toBe(client.id);
  });

  it("un projet retiré n'est plus le projet en cours ; sans projet, un nouveau est créé", async () => {
    const root = await mkdtemp(join(tmpdir(), 'pastille-'));
    const store = createSessionStore(root);
    const first = await store.currentProject();
    await store.removeProject(first.id);
    const next = await store.currentProject();
    expect(next.id).not.toBe(first.id);
    expect(next.name).toBe('Mes revues');
  });
});

