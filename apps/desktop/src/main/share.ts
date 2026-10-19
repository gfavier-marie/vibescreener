// Partage d'un projet par fichier .vibescreener (aucun import d'Electron ici : testable avec node) : un zip,
// vibescreener.json (l'index) puis sessions/<id>/… pour chaque revue. Importer un fichier, ou une copie d'un
// projet en ligne (lien de lecture, voir sync.ts), ajoute le projet ou le complète : pour chaque revue, la
// version la plus récente est gardée.

import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, normalize, sep } from 'node:path';
import JSZip from 'jszip';
import { allAnnotations, upgradeSession, type Note, type Session, type ShareIndex, type SharedSession } from '@pastille/shared';
import { T } from '../texts/index.ts';
import { textMapPath } from './document/anchor.ts';
import type { SessionStore } from './session-store.ts';

/** `joined` : lien de collaboration, le projet reste synchronisé. */
export type ImportReport = { projectId: string; name: string; added: number; updated: number; unchanged: number; kept: number; joined?: boolean };

/** Erreur à montrer telle quelle (fichier invalide, lien expiré, relais injoignable). */
export class ShareError extends Error {}

/** Projet à importer : son index et, à la demande, les fichiers d'une revue (relatifs à son dossier, session.json compris). */
export type Source = { index: ShareIndex; files(sessionId: string): Promise<Map<string, Uint8Array>> };

/** Format du fichier .vibescreener (celui du projet en ligne est SHARE_FORMAT). */
const FILE_FORMAT = 1;
const INDEX_FILE = 'vibescreener.json';
const ID = /^[\w-]+$/;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * Fichiers d'une revue, relatifs à son dossier : images, textes des pages, documents, croquis, inspirations,
 * et les dictées pas encore transcrites (pas en ligne : l'ordinateur qui a dicté transcrit).
 */
export function sessionFiles(s: Session, opts: { audio?: boolean } = {}): string[] {
  const files = new Set<string>();
  const audio = (c: Pick<Note, 'audio' | 'transcription'>) => opts.audio !== false && c.audio && c.transcription !== 'done' && files.add(c.audio);
  for (const c of s.captures) {
    files.add(c.image);
    const doc = c.source?.document;
    if (doc) files.add(textMapPath(c)).add(`documents/${doc.id}.${doc.format}`);
    for (const a of c.annotations) {
      audio(a);
      for (const k of a.sketches) files.add(k.png).add(k.strokes);
      for (const i of a.inspirations ?? []) files.add(i.image);
    }
  }
  for (const n of s.notes ?? []) audio(n);
  return [...files];
}

export const summary = (s: Session): SharedSession => ({
  id: s.id,
  name: s.name,
  points: allAnnotations(s).length,
  screens: s.captures.length,
  updatedAt: s.updatedAt,
});

/** Fichiers d'un zip sous `prefix`, chemins relatifs à ce préfixe. */
export async function zipEntries(zip: JSZip, prefix = ''): Promise<Map<string, Uint8Array>> {
  const out = new Map<string, Uint8Array>();
  for (const entry of Object.values(zip.files)) {
    if (entry.dir || !entry.name.startsWith(prefix)) continue;
    out.set(entry.name.slice(prefix.length), await entry.async('uint8array'));
  }
  return out;
}

/** Les images, déjà compressées, sont rangées telles quelles ; seul le JSON est compressé. */
const zipOptions = (path: string) => ({ compression: path.endsWith('.json') ? ('DEFLATE' as const) : ('STORE' as const) });

export function checkIndex(index: ShareIndex | null, format: number): ShareIndex {
  if (index?.app !== 'vibescreener' || !index.project || !ID.test(index.project.id) || !Array.isArray(index.sessions)) throw new ShareError(T.share.invalid);
  if (index.format > format) throw new ShareError(T.share.newer);
  return index;
}

/** Revue lue en mémoire si elle est ouverte (dernières modifications), sinon sur le disque. */
export async function readSession(store: SessionStore, id: string): Promise<Session> {
  const open = store.get();
  return open?.id === id ? open : store.readSession(id);
}

/** Écrit les fichiers reçus d'une revue dans son dossier, sans jamais en sortir. */
export async function writeFiles(dir: string, files: Map<string, Uint8Array>) {
  for (const [file, data] of files) {
    const path = normalize(join(dir, file));
    if (file === 'session.json' || !path.startsWith(dir + sep)) continue;
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, data);
  }
  await mkdir(join(dir, 'captures'), { recursive: true });
}

export function createSharing(deps: { store: SessionStore }) {
  const { store } = deps;

  async function sessionEntries(s: Session): Promise<Map<string, Uint8Array>> {
    const dir = store.dir(s);
    const out = new Map<string, Uint8Array>([['session.json', encoder.encode(JSON.stringify(s, null, 2))]]);
    for (const file of sessionFiles(s)) {
      const path = join(dir, file);
      if (existsSync(path)) out.set(file, await readFile(path));
    }
    return out;
  }

  async function exportFile(projectId: string, path: string) {
    const project = (await store.listProjects()).find((p) => p.id === projectId);
    if (!project) throw new ShareError(T.share.noProject);
    const sessions = await Promise.all(project.sessions.map((x) => readSession(store, x.id)));
    const { id, name, context, createdAt, updatedAt } = (await store.projects()).find((p) => p.id === projectId)!;
    const index: ShareIndex = { app: 'vibescreener', format: FILE_FORMAT, project: { id, name, context, createdAt, updatedAt }, sessions: sessions.map(summary), sharedAt: new Date().toISOString() };
    const zip = new JSZip();
    zip.file(INDEX_FILE, JSON.stringify(index, null, 2), zipOptions(INDEX_FILE));
    for (const s of sessions) for (const [file, data] of await sessionEntries(s)) zip.file(`sessions/${s.id}/${file}`, data, zipOptions(file));
    await writeFile(path, await zip.generateAsync({ type: 'uint8array' }));
  }

  async function readFileSource(path: string): Promise<Source> {
    let zip: JSZip;
    try {
      zip = await JSZip.loadAsync(await readFile(path));
    } catch {
      throw new ShareError(T.share.invalid);
    }
    let index: ShareIndex | null = null;
    try {
      index = JSON.parse((await zip.file(INDEX_FILE)?.async('string')) ?? 'null') as ShareIndex | null;
    } catch {}
    return { index: checkIndex(index, FILE_FORMAT), files: (id) => zipEntries(zip, `sessions/${id}/`) };
  }

  /** Ajoute le projet, ou le complète : revue par revue, la plus récente est gardée. */
  async function importSource(source: Source): Promise<ImportReport> {
    const { index } = source;
    const local = (await store.projects()).find((p) => p.id === index.project.id);
    if (!local || index.project.updatedAt > local.updatedAt) {
      const { id, name, context, createdAt, updatedAt } = index.project;
      await store.putProject({ id, name: String(name), context: context ? String(context) : undefined, createdAt, updatedAt });
    }
    const report: ImportReport = { projectId: index.project.id, name: local && local.updatedAt >= index.project.updatedAt ? local.name : index.project.name, added: 0, updated: 0, unchanged: 0, kept: 0 };
    for (const incoming of index.sessions) {
      if (!ID.test(incoming.id)) continue;
      const mine = await readSession(store, incoming.id).catch(() => undefined);
      if (mine?.updatedAt === incoming.updatedAt) report.unchanged++;
      else if (mine && mine.updatedAt > incoming.updatedAt) report.kept++;
      else {
        await write(incoming.id, await source.files(incoming.id), index.project.id);
        report[mine ? 'updated' : 'added']++;
      }
    }
    return report;
  }

  /** Écrit une revue reçue dans son dossier, session.json en dernier. */
  async function write(id: string, files: Map<string, Uint8Array>, projectId: string) {
    const raw = files.get('session.json');
    if (!raw) throw new ShareError(T.share.invalid);
    const s = upgradeSession(JSON.parse(decoder.decode(raw)) as Session);
    if (s.id !== id) throw new ShareError(T.share.invalid);
    s.projectId = projectId;
    // Une dictée en cours chez l'autre ne se termine pas ici : « Réessayer » si son audio a suivi.
    const settle = (c: Pick<Note, 'audio' | 'transcription'>) => {
      if (c.transcription === 'pending' || c.transcription === 'recording') c.transcription = c.audio && files.has(c.audio) ? 'error' : 'none';
    };
    for (const a of allAnnotations(s)) settle(a);
    for (const n of s.notes ?? []) settle(n);
    await writeFiles(store.dir(s), files);
    await store.replace(s);
  }

  return {
    exportFile,
    importFile: async (path: string) => importSource(await readFileSource(path)),
    importSource,
  };
}

export type Sharing = ReturnType<typeof createSharing>;
