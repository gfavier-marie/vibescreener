// Stockage local : un dossier par session (session.json + captures/…), écrit de façon
// atomique avec un anti-rebond de 300 ms. La session ouverte se rouvre au démarrage.
// Projets : projects.json (nom, contexte) ; chaque session porte l'id de son projet.

import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  allAnnotations,
  findAnnotation,
  newNote,
  newProject,
  newSession,
  renumber,
  upgradeSession,
  type Annotation,
  type Capture,
  type Geometry,
  type Inspiration,
  type Project,
  type Session,
} from '@pastille/shared';
import { T } from '../texts/index.ts';
import { renameRetry } from './rename.ts';

const SAVE_DELAY_MS = 300;
const HISTORY_LIMIT = 200;
const COALESCE_MS = 1500;

export type UpdateOptions = {
  /** Modification de l'utilisateur, annulable avec ⌘Z. */
  undoable?: boolean;
  /** Deux modifications de même clé rapprochées (frappe dans un commentaire) ne font qu'une étape. */
  coalesceKey?: string;
  /** Résultat arrivé en différé (transcription) : appliqué aussi à l'historique pour ne pas être perdu par ⌘Z. */
  patchHistory?: boolean;
};

type State = { currentSessionId?: string; currentProjectId?: string };

/** Une session enregistrée, telle que listée (menus, panneau des projets, MCP). */
export type SessionSummary = { id: string; name: string; projectId: string; points: number; screens: number; updatedAt: string };

/** Un projet et ses revues, la plus récente d'abord ; `updatedAt` : dernière activité ; `current` : la prochaine revue y naîtra. */
export type ProjectSummary = Project & { sessions: SessionSummary[]; current: boolean };

export type SessionStore = ReturnType<typeof createSessionStore>;

/**
 * `onProjects` : liste des projets modifiée. `legacyContext` : contexte du projet tel qu'il était
 * réglé avant les projets, donné une fois au premier projet.
 */
export function createSessionStore(
  root: string,
  opts: { onChange?: (s: Session | null) => void; onProjects?: () => void; legacyContext?: () => string } = {},
) {
  const onChange = opts.onChange ?? (() => {});
  const onProjects = opts.onProjects ?? (() => {});
  const sessionsDir = join(root, 'sessions');
  const statePath = join(root, 'state.json');
  const projectsPath = join(root, 'projects.json');
  let session: Session | null = null;
  let state: State = {};
  let projects: Project[] = []; // ordre de création ; lus au premier besoin
  let loadingProjects: Promise<void> | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let undoStack: Session[] = [];
  let redoStack: Session[] = [];
  let lastPush = { key: '', at: 0 };
  let saving = Promise.resolve();

  const dirOf = (id: string) => join(sessionsDir, id);

  async function writeAtomic(path: string, data: string) {
    await writeFile(path + '.tmp', data);
    await renameRetry(path + '.tmp', path);
  }

  /** Écritures de state.json l'une après l'autre : deux renommages du même .tmp en parallèle échouent. */
  let savingState = Promise.resolve();
  function saveState() {
    savingState = savingState
      .catch(() => {})
      .then(async () => {
        await mkdir(root, { recursive: true });
        await writeAtomic(statePath, JSON.stringify(state, null, 2));
      });
    return savingState;
  }

  let savingProjects = Promise.resolve();
  function saveProjects() {
    const json = JSON.stringify(projects, null, 2);
    savingProjects = savingProjects
      .catch(() => {})
      .then(async () => {
        await mkdir(root, { recursive: true });
        await writeAtomic(projectsPath, json);
      });
    onProjects();
    return savingProjects;
  }

  async function readSession(id: string): Promise<Session> {
    return upgradeSession(JSON.parse(await readFile(join(dirOf(id), 'session.json'), 'utf8')) as Session);
  }

  /** Session fermée modifiée sur le disque (déplacée dans un autre projet). */
  async function writeSession(s: Session) {
    await writeAtomic(join(dirOf(s.id), 'session.json'), JSON.stringify(s, null, 2));
  }

  async function sessionIds(): Promise<string[]> {
    return existsSync(sessionsDir) ? (await readdir(sessionsDir)).filter((id) => existsSync(join(dirOf(id), 'session.json'))) : [];
  }

  /**
   * Projets lus une fois. Le premier lancement après leur arrivée crée « Mes revues », qui reçoit
   * les sessions existantes et le contexte réglé jusque-là.
   */
  async function loadProjects(): Promise<Project[]> {
    await (loadingProjects ??= readProjects()); // une seule lecture, même pour des appels simultanés
    return projects;
  }

  async function readProjects() {
    if (existsSync(projectsPath)) {
      projects = JSON.parse(await readFile(projectsPath, 'utf8')) as Project[];
      return;
    }
    const first = newProject(T.projects.defaultName, opts.legacyContext?.());
    projects = [first];
    for (const id of await sessionIds()) {
      try {
        const s = await readSession(id);
        if (!s.projectId) await writeSession({ ...s, projectId: first.id });
      } catch {
        // dossier illisible : ignoré
      }
    }
    state.currentProjectId = first.id;
    await saveState();
    await saveProjects();
  }

  /** Projet d'une session ; une session sans projet connu est rangée dans le premier. */
  function projectOf(s: Pick<Session, 'projectId'>): Project | undefined {
    return projects.find((p) => p.id === s.projectId) ?? projects[0];
  }

  /** Projet où naît la prochaine revue : celui de la session ouverte, ou le dernier choisi. */
  async function currentProject(): Promise<Project> {
    const list = await loadProjects();
    const found = list.find((p) => p.id === (session?.projectId ?? state.currentProjectId)) ?? list[0];
    if (found) return found;
    const p = newProject(T.projects.defaultName);
    list.push(p);
    state.currentProjectId = p.id;
    await saveState();
    await saveProjects();
    return p;
  }

  /** Contexte repris par les exports et Claude Code : celui du projet, sinon celui de l'ancienne session. */
  function contextOf(s: Session): string | undefined {
    return projectOf(s)?.context?.trim() || s.context?.trim() || undefined;
  }

  function scheduleSave() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void flush(), SAVE_DELAY_MS);
  }

  /** Écrit immédiatement les modifications en attente. */
  async function flush() {
    if (timer) clearTimeout(timer);
    timer = null;
    const s = session;
    if (!s) return saving;
    const json = JSON.stringify(s, null, 2);
    // Un échec est signalé à l'appelant sans bloquer les sauvegardes suivantes.
    saving = saving.catch(() => {}).then(() => writeAtomic(join(dirOf(s.id), 'session.json'), json));
    return saving;
  }

  /** Rouvre la session en cours au démarrage (après un crash ou une fermeture). */
  async function restore(): Promise<Session | null> {
    if (existsSync(statePath)) state = JSON.parse(await readFile(statePath, 'utf8')) as State;
    await loadProjects();
    const path = state.currentSessionId && join(dirOf(state.currentSessionId), 'session.json');
    session = path && existsSync(path) ? upgradeSession(JSON.parse(await readFile(path, 'utf8')) as Session) : null;
    onChange(session);
    return session;
  }

  /** La session ouverte, créée à la première capture si besoin. */
  async function ensure(): Promise<Session> {
    if (session) return session;
    const project = await currentProject();
    if (session) return session; // créée pendant la lecture des projets
    const now = new Date();
    const s = newSession(now, undefined, T.sessionName(now), project.id);
    await mkdir(join(dirOf(s.id), 'captures'), { recursive: true });
    session = s;
    state.currentSessionId = s.id;
    state.currentProjectId = project.id;
    await saveState();
    await flush();
    onChange(session);
    return s;
  }

  /** Toute modification passe par ici : numérotation, horodatage, sauvegarde, notification. */
  function update(mutate: (s: Session) => void, opts: UpdateOptions = {}) {
    if (!session) return;
    if (opts.undoable) {
      const now = Date.now();
      const coalesce = opts.coalesceKey && opts.coalesceKey === lastPush.key && now - lastPush.at < COALESCE_MS;
      if (!coalesce) undoStack = [...undoStack, structuredClone(session)].slice(-HISTORY_LIMIT);
      lastPush = { key: opts.coalesceKey ?? '', at: now };
      redoStack = [];
    }
    if (opts.patchHistory) for (const snapshot of [...undoStack, ...redoStack]) mutate(snapshot);
    mutate(session);
    commit();
  }

  function commit() {
    if (!session) return;
    renumber(session);
    session.updatedAt = new Date().toISOString();
    scheduleSave();
    onChange(session);
  }

  async function addCapture(
    png: Uint8Array,
    meta: Pick<Capture, 'width' | 'height' | 'scaleFactor' | 'source'>,
  ): Promise<Capture> {
    const s = await ensure();
    const capture: Capture = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      image: '',
      ...meta,
      annotations: [],
    };
    capture.image = `captures/${capture.id}.png`;
    await mkdir(join(dirOf(s.id), 'captures'), { recursive: true });
    await writeFile(join(dirOf(s.id), capture.image), png);
    // Une capture n'est pas annulable : elle est ajoutée aussi à l'historique.
    update((x) => x.captures.push(structuredClone(capture)), { patchHistory: true });
    return capture;
  }

  /** Nouveau point vide sur une capture (annulable) ; son numéro est attribué par la numérotation. */
  function addAnnotation(captureId: string, geometry: Geometry): string {
    const now = new Date().toISOString();
    const annotation: Annotation = {
      id: crypto.randomUUID(),
      number: 0,
      geometry,
      text: '',
      input: 'typed',
      transcription: 'none',
      sketches: [],
      createdAt: now,
      updatedAt: now,
    };
    update((s) => s.captures.find((c) => c.id === captureId)?.annotations.push(annotation), { undoable: true });
    return annotation.id;
  }

  /** Nouvelle remarque générale vide (annulable), dans la session ouverte ou une nouvelle. */
  async function addNote(): Promise<string> {
    await ensure();
    const note = newNote();
    update((s) => (s.notes = [...(s.notes ?? []), note]), { undoable: true });
    return note.id;
  }

  /** Inspiration jointe à un point (annulable) ; l'image reste sur le disque pour que ⌘Z puisse la rétablir. */
  async function addInspiration(annotationId: string, png: Uint8Array, source?: Inspiration['source']) {
    const s = session;
    if (!s || !findAnnotation(s, annotationId)) return;
    const id = crypto.randomUUID();
    const inspiration: Inspiration = { id, image: `inspirations/${id}.png`, createdAt: new Date().toISOString(), source };
    await mkdir(join(dirOf(s.id), 'inspirations'), { recursive: true });
    await writeFile(join(dirOf(s.id), inspiration.image), png);
    update(
      (x) => {
        const a = findAnnotation(x, annotationId)?.annotation;
        if (a) a.inspirations = [...(a.inspirations ?? []), { ...inspiration }];
      },
      { undoable: true },
    );
  }

  /** Point resté vide (Échap) : retiré partout, historique compris, pour que ⌘Z ne le fasse pas revenir. */
  function discard(annotationId: string) {
    if (!session || !findAnnotation(session, annotationId)) return;
    update(
      (s) => {
        for (const c of s.captures) c.annotations = c.annotations.filter((a) => a.id !== annotationId);
        renumber(s);
      },
      { patchHistory: true },
    );
    // Les étapes devenues sans effet (création du point, frappe effacée) disparaissent : ⌘Z revient avant le point.
    const same = (a: Session, b: Session) => JSON.stringify({ ...a, updatedAt: '' }) === JSON.stringify({ ...b, updatedAt: '' });
    let next = session;
    for (let i = undoStack.length - 1; i >= 0; i--) {
      if (same(undoStack[i]!, next)) undoStack.splice(i, 1);
      else next = undoStack[i]!;
    }
  }

  /** Annuler (⌘Z) / rétablir (⌘⇧Z) : la session revient à l'état précédent. */
  function undo() {
    const previous = undoStack.pop();
    if (!session || !previous) return;
    redoStack.push(session);
    session = previous;
    lastPush = { key: '', at: 0 };
    commit();
  }

  function redo() {
    const next = redoStack.pop();
    if (!session || !next) return;
    undoStack.push(session);
    session = next;
    commit();
  }

  function summary(s: Session): SessionSummary {
    return {
      id: s.id,
      name: s.name,
      projectId: projectOf(s)?.id ?? '',
      updatedAt: s.updatedAt,
      points: allAnnotations(s).length,
      screens: s.captures.length,
    };
  }

  /** Sessions récentes, la plus récente d'abord (menu de l'icône) ; la session ouverte est lue en mémoire. */
  async function recent(limit = 5): Promise<SessionSummary[]> {
    await loadProjects();
    const list: SessionSummary[] = [];
    for (const id of await sessionIds()) {
      try {
        list.push(summary(session?.id === id ? session : await readSession(id)));
      } catch {
        // dossier incomplet : ignoré
      }
    }
    return list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, limit);
  }

  /** Tous les projets avec leurs revues, le plus récemment actif d'abord. */
  async function listProjects(): Promise<ProjectSummary[]> {
    const sessions = await recent(Infinity);
    const current = (await currentProject()).id;
    return (await loadProjects())
      .map((p) => {
        const own = sessions.filter((s) => s.projectId === p.id);
        return { ...p, sessions: own, current: p.id === current, updatedAt: [p.updatedAt, ...own.map((s) => s.updatedAt)].sort().at(-1)! };
      })
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  /** Rouvre une session (pour la compléter ou la réexporter) ; son projet devient le projet en cours. */
  async function open(id: string) {
    await flush();
    await loadProjects();
    session = await readSession(id);
    undoStack = [];
    redoStack = [];
    state.currentSessionId = id;
    state.currentProjectId = projectOf(session)?.id;
    await saveState();
    onChange(session);
  }

  async function createProject(name: string): Promise<Project> {
    const list = await loadProjects();
    const p = newProject(name.trim() || T.projects.untitled);
    list.push(p);
    await saveProjects();
    return p;
  }

  /** Projet ajouté ou remplacé tel quel (import d'un projet partagé). */
  async function putProject(p: Project) {
    const list = await loadProjects();
    const i = list.findIndex((x) => x.id === p.id);
    if (i >= 0) list[i] = p;
    else list.push(p);
    await saveProjects();
    if (session && projectOf(session)?.id === p.id) onChange(session);
  }

  async function updateProject(id: string, patch: { name?: string; context?: string }) {
    const p = (await loadProjects()).find((x) => x.id === id);
    if (!p) return;
    if (patch.name !== undefined) p.name = patch.name.trim() || p.name;
    if (patch.context !== undefined) p.context = patch.context.trim() || undefined;
    p.updatedAt = new Date().toISOString();
    await saveProjects();
    if (session && projectOf(session)?.id === id) onChange(session);
  }

  /** Projet retiré de la liste, ses sessions déjà mises à la corbeille. */
  async function removeProject(id: string) {
    projects = (await loadProjects()).filter((p) => p.id !== id);
    if (state.currentProjectId === id) {
      state.currentProjectId = undefined;
      await saveState();
    }
    await saveProjects();
  }

  /** Revue remplacée par une version reçue (import d'un projet partagé), en mémoire si elle est ouverte. */
  async function replace(s: Session) {
    if (session?.id !== s.id) {
      await writeSession(s);
      onProjects();
      return;
    }
    session = s;
    undoStack = [];
    redoStack = [];
    await flush();
    onChange(session);
    onProjects();
  }

  /** Revue rangée dans un autre projet. */
  async function moveSession(id: string, projectId: string) {
    if (session?.id === id) {
      update((s) => (s.projectId = projectId), { patchHistory: true });
      state.currentProjectId = projectId;
      await saveState();
    } else {
      await writeSession({ ...(await readSession(id)), projectId, updatedAt: new Date().toISOString() });
    }
    onProjects();
  }

  /** « Nouvelle revue » dans un projet : la session ouverte est fermée, la suivante naîtra dans ce projet. */
  async function startIn(projectId: string) {
    await close();
    state.currentProjectId = projectId;
    await saveState();
    onProjects();
  }

  /** « Nouvelle session » : la session actuelle est fermée, la suivante naîtra à la prochaine capture. */
  async function close() {
    await flush();
    undoStack = [];
    redoStack = [];
    session = null;
    state.currentSessionId = undefined;
    await saveState();
    onChange(null);
  }

  return {
    get: () => session,
    dir: (s: Pick<Session, 'id'>) => dirOf(s.id),
    sessionsDir,
    readSession,
    writeSession,
    projects: loadProjects,
    projectOf,
    currentProject,
    contextOf,
    listProjects,
    createProject,
    putProject,
    updateProject,
    removeProject,
    moveSession,
    startIn,
    replace,
    restore,
    ensure,
    update,
    discard,
    undo,
    redo,
    recent,
    open,
    addCapture,
    addAnnotation,
    addNote,
    addInspiration,
    flush,
    close,
  };
}
