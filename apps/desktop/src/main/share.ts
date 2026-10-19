// Partage d'un projet (aucun import d'Electron ici : testable avec node).
// Fichier .vibescreener : un zip, vibescreener.json (l'index) puis sessions/<id>/… pour chaque revue.
// Lien de lecture : chaque revue est un zip chiffré (AES-GCM) déposé sur le relais, puis l'index ;
// la clé ne quitte pas le lien. Importer l'un ou l'autre ajoute le projet ou le complète : pour chaque
// revue, la version la plus récente est gardée.

import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, normalize, sep } from 'node:path';
import JSZip from 'jszip';
import {
  allAnnotations,
  importKey,
  MAX_SHARE_BYTES,
  open as unseal,
  parseShareUrl,
  seal,
  SHARE_DAYS,
  SHARE_FORMAT,
  shareObjectUrl,
  shareUrl,
  toBase64Url,
  upgradeSession,
  type Note,
  type Session,
  type ShareIndex,
  type SharedSession,
} from '@pastille/shared';
import { T } from '../texts/index.ts';
import { textMapPath } from './document/anchor.ts';
import { renameRetry } from './rename.ts';
import type { SessionStore } from './session-store.ts';

/** Lien d'un projet, gardé sur cet ordinateur seulement (shares.json) : le jeton permet de le mettre à jour ou de l'arrêter. */
type Share = { relay: string; id: string; key: string; token: string; sharedAt: string };

/** Ce que voit l'interface d'un lien. */
export type ShareLink = { url: string; sharedAt: string; expiresAt: string };

export type ImportReport = { projectId: string; name: string; added: number; updated: number; unchanged: number; kept: number };

/** Erreur à montrer telle quelle (fichier invalide, lien expiré, relais injoignable). */
export class ShareError extends Error {}

/** Projet à importer : son index et, à la demande, les fichiers d'une revue (relatifs à son dossier, session.json compris). */
type Source = { index: ShareIndex; files(sessionId: string): Promise<Map<string, Uint8Array>> };

const INDEX_FILE = 'vibescreener.json';
const ID = /^[\w-]+$/;
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const mb = (bytes: number) => Math.ceil(bytes / 1024 / 1024);

/** Fichiers d'une revue, relatifs à son dossier : images, textes des pages, documents, croquis, inspirations, et les dictées pas encore transcrites. */
export function sessionFiles(s: Session): string[] {
  const files = new Set<string>();
  const audio = (c: Pick<Note, 'audio' | 'transcription'>) => c.audio && c.transcription !== 'done' && files.add(c.audio);
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

const summary = (s: Session): SharedSession => ({
  id: s.id,
  name: s.name,
  points: allAnnotations(s).length,
  screens: s.captures.length,
  updatedAt: s.updatedAt,
});

/** Fichiers d'un zip sous `prefix`, chemins relatifs à ce préfixe. */
async function zipEntries(zip: JSZip, prefix = ''): Promise<Map<string, Uint8Array>> {
  const out = new Map<string, Uint8Array>();
  for (const entry of Object.values(zip.files)) {
    if (entry.dir || !entry.name.startsWith(prefix)) continue;
    out.set(entry.name.slice(prefix.length), await entry.async('uint8array'));
  }
  return out;
}

/** Les images, déjà compressées, sont rangées telles quelles ; seul le JSON est compressé. */
const zipOptions = (path: string) => ({ compression: path.endsWith('.json') ? ('DEFLATE' as const) : ('STORE' as const) });

function checkIndex(index: ShareIndex | null): ShareIndex {
  if (index?.app !== 'vibescreener' || !index.project || !ID.test(index.project.id) || !Array.isArray(index.sessions)) throw new ShareError(T.share.invalid);
  if (index.format > SHARE_FORMAT) throw new ShareError(T.share.newer);
  return index;
}

export function createSharing(deps: { store: SessionStore; dataDir: string; relay: string; fetch: (url: string, init: RequestInit) => Promise<Response> }) {
  const { store } = deps;
  const sharesPath = join(deps.dataDir, 'shares.json');
  let shares: Record<string, Share> | null = null;
  const busy = new Set<string>(); // projets en cours d'envoi

  async function loadShares() {
    shares ??= existsSync(sharesPath) ? (JSON.parse(await readFile(sharesPath, 'utf8')) as Record<string, Share>) : {};
    return shares;
  }

  async function saveShares() {
    await writeFile(sharesPath + '.tmp', JSON.stringify(shares, null, 2));
    await renameRetry(sharesPath + '.tmp', sharesPath);
  }

  /** Revue lue en mémoire si elle est ouverte (dernières modifications), sinon sur le disque. */
  async function session(id: string): Promise<Session> {
    const open = store.get();
    return open?.id === id ? open : store.readSession(id);
  }

  async function sessionEntries(s: Session): Promise<Map<string, Uint8Array>> {
    const dir = store.dir(s);
    const out = new Map<string, Uint8Array>([['session.json', encoder.encode(JSON.stringify(s, null, 2))]]);
    for (const file of sessionFiles(s)) {
      const path = join(dir, file);
      if (existsSync(path)) out.set(file, await readFile(path));
    }
    return out;
  }

  async function buildIndex(projectId: string): Promise<{ index: ShareIndex; sessions: Session[] }> {
    const project = (await store.listProjects()).find((p) => p.id === projectId);
    if (!project) throw new ShareError(T.share.noProject);
    const sessions = await Promise.all(project.sessions.map((x) => session(x.id)));
    const { id, name, context, createdAt, updatedAt } = (await store.projects()).find((p) => p.id === projectId)!;
    return {
      index: { app: 'vibescreener', format: SHARE_FORMAT, project: { id, name, context, createdAt, updatedAt }, sessions: sessions.map(summary), sharedAt: new Date().toISOString() },
      sessions,
    };
  }

  // ——— Fichier ———

  async function exportFile(projectId: string, path: string) {
    const { index, sessions } = await buildIndex(projectId);
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
    return { index: checkIndex(index), files: (id) => zipEntries(zip, `sessions/${id}/`) };
  }

  // ——— Lien ———

  async function request(url: string, init: RequestInit): Promise<Response> {
    try {
      return await deps.fetch(url, init);
    } catch (err) {
      throw new ShareError(T.share.offline(err instanceof Error ? err.message : String(err)));
    }
  }

  function view(share: Share): ShareLink {
    const expires = new Date(Date.parse(share.sharedAt) + SHARE_DAYS * 86_400_000);
    return { url: shareUrl(share.relay, share.id, share.key), sharedAt: share.sharedAt, expiresAt: expires.toISOString() };
  }

  async function link(projectId: string): Promise<ShareLink | undefined> {
    const share = (await loadShares())[projectId];
    return share && view(share);
  }

  /**
   * Envoie le projet sur le relais : chaque revue, puis l'index (la visionneuse ne voit jamais une revue
   * manquante). Le premier envoi crée le lien ; les suivants le mettent à jour et repoussent son expiration.
   */
  async function publish(projectId: string, onProgress: (done: number, total: number) => void = () => {}): Promise<ShareLink> {
    if (busy.has(projectId)) throw new ShareError(T.share.busy);
    busy.add(projectId);
    try {
      const list = await loadShares();
      const random = (n: number) => toBase64Url(crypto.getRandomValues(new Uint8Array(n)));
      const share: Share = list[projectId] ?? { relay: deps.relay, id: random(16), key: random(32), token: random(32), sharedAt: '' };
      const key = await importKey(share.key);
      const { index, sessions } = await buildIndex(projectId);
      const put = async (name: string, plain: Uint8Array) => {
        const body = await seal(key, new Uint8Array(plain));
        if (body.length > MAX_SHARE_BYTES) throw new ShareError(T.share.tooBig(name === 'index' ? index.project.name : sessions.find((s) => s.id === name)!.name, mb(body.length), mb(MAX_SHARE_BYTES)));
        const res = await request(shareObjectUrl(share.relay, share.id, name), {
          method: 'PUT',
          body,
          headers: { Authorization: `Bearer ${share.token}`, 'Content-Type': 'application/octet-stream' },
        });
        if (!res.ok) throw new ShareError(T.share.refused(res.status));
      };
      onProgress(0, sessions.length + 1);
      for (const [i, s] of sessions.entries()) {
        const zip = new JSZip();
        for (const [file, data] of await sessionEntries(s)) zip.file(file, data, zipOptions(file));
        await put(s.id, await zip.generateAsync({ type: 'uint8array' }));
        onProgress(i + 1, sessions.length + 1);
      }
      await put('index', encoder.encode(JSON.stringify(index)));
      onProgress(sessions.length + 1, sessions.length + 1);
      share.sharedAt = index.sharedAt;
      list[projectId] = share;
      await saveShares();
      return view(share);
    } finally {
      busy.delete(projectId);
    }
  }

  /** Arrête le partage : le relais efface le lien, qui ne s'ouvre plus. */
  async function revoke(projectId: string) {
    const list = await loadShares();
    const share = list[projectId];
    if (!share) return;
    const res = await request(`${share.relay}/share/${share.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${share.token}` } });
    if (!res.ok && res.status !== 404) throw new ShareError(T.share.refused(res.status));
    delete list[projectId];
    await saveShares();
  }

  async function readLinkSource(text: string): Promise<Source> {
    const parsed = parseShareUrl(text);
    if (!parsed) throw new ShareError(T.share.notALink);
    let key: CryptoKey;
    try {
      key = await importKey(parsed.key);
    } catch {
      throw new ShareError(T.share.badKey);
    }
    const get = async (name: string) => {
      const res = await request(shareObjectUrl(parsed.relay, parsed.id, name), { method: 'GET' });
      if (res.status === 404) throw new ShareError(T.share.expired(SHARE_DAYS));
      if (!res.ok) throw new ShareError(T.share.refused(res.status));
      try {
        return await unseal(key, new Uint8Array(await res.arrayBuffer()));
      } catch {
        throw new ShareError(T.share.badKey);
      }
    };
    const index = checkIndex(JSON.parse(decoder.decode(await get('index'))) as ShareIndex);
    return { index, files: async (id) => zipEntries(await JSZip.loadAsync(await get(id))) };
  }

  // ——— Import ———

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
      const mine = await session(incoming.id).catch(() => undefined);
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
    const dir = store.dir(s);
    for (const [file, data] of files) {
      const path = normalize(join(dir, file));
      if (file === 'session.json' || !path.startsWith(dir + sep)) continue; // jamais hors du dossier de la revue
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, data);
    }
    await mkdir(join(dir, 'captures'), { recursive: true });
    await store.replace(s);
  }

  return {
    exportFile,
    importFile: async (path: string) => importSource(await readFileSource(path)),
    importLink: async (text: string) => importSource(await readLinkSource(text)),
    link,
    publish,
    revoke,
  };
}

export type Sharing = ReturnType<typeof createSharing>;
