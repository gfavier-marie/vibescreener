// Contrat IPC entre le processus principal et les fenêtres (exposé par le preload).

import type { Geometry, Session } from '@pastille/shared';
import type { LicenseView } from './main/license.ts';
import type { ProjectSummary, SessionSummary } from './main/session-store.ts';
import type { Settings, SettingsView } from './main/settings.ts';
import type { ImportReport } from './main/share.ts';
import type { ShareView } from './main/sync.ts';

export type { ImportReport, LicenseView, ProjectSummary, SessionSummary, Settings, ShareView };

/** Écran figé, et de quoi annoncer la capture : session, numéro d'écran, numéro du prochain point. */
export type OverlayShow = {
  jpeg: Uint8Array;
  session: string;
  screen: number;
  nextNumber: number;
  cursor?: { x: number; y: number }; // position du curseur sur cet écran, au moment du raccourci
  inspiration?: number; // capture d'une inspiration pour ce point : rien n'est posé
  tour?: boolean; // mode parcours : le clic choisit la fenêtre à suivre, rien n'est capturé
};

/** Fenêtre visable sur l'écran de l'overlay (DIP), de l'avant vers l'arrière. */
export type OverlayWindow = { x: number; y: number; width: number; height: number; app?: string; title?: string };

/** Coordonnées en pixels logiques (DIP), relatives à l'écran de l'overlay. */
export type OverlayPick =
  | { kind: 'click'; x: number; y: number; shift?: boolean }
  | { kind: 'zone'; x: number; y: number; w: number; h: number; crop?: boolean } // ⌥ : recadrer ; sinon zone montrée sur la fenêtre
  | { kind: 'cancel' };

/** Mode vidéo : un écran filmé par la fenêtre cachée (source de desktopCapturer), taille en pixels physiques. */
export type VideoSource = { displayId: number; sourceId: string; width: number; height: number };

/** Retour à l'écran pendant la vidéo : point provisoire et état réel du micro. */
export type VideoFeedback = {
  click?: { displayId: number; x: number; y: number; number: number; at: number; geometry?: Geometry };
  elapsedMs: number;
  level: number;
  voiced: boolean;
  kept?: boolean;
  paused?: boolean;
  inspiration?: { shortcut: string; number?: number };
  stopShortcut?: string; // raccourci qui arrête l'enregistrement, affiché sur « Arrêter »
  tablet?: boolean;
  armed?: boolean; // ⌘ / Ctrl tenu : le prochain clic pose un point
  writing?: boolean; // commentaire écrit en cours (point ou remarque générale), audio suspendu
  compact?: boolean; // bandeau réduit à une pastille
  typing?: boolean; // clavier seul : micro coupé
  typingFixed?: boolean; // clavier seul choisi dans les réglages : pas de bouton pour rallumer le micro
  error?: string;
} | null;

export type VideoAction = 'draw' | 'inspiration' | 'write' | 'capture-inspiration' | 'cancel-inspiration' | 'stop' | 'compact' | 'typing';

/** Image figée au clic, recadrée sur la cible : rectangle en 0–1 de l'écran ; null la jette. */
export type VideoCrop = { frameId: number; rect: { x: number; y: number; width: number; height: number } | null };

/** Image recadrée, sa vignette en niveaux de gris (pour reconnaître un écran inchangé) et ses mesures. */
export type VideoImage = {
  png: Uint8Array;
  width: number; // pixels physiques
  height: number;
  thumb: Uint8Array; // VIDEO_THUMB.width × VIDEO_THUMB.height octets
  frozenAt: number; // Date.now() quand l'image a été figée
  frameAgeMs: number; // âge de l'image à ce moment
};

export const VIDEO_THUMB = { width: 64, height: 36 };

/** Fenêtre cachée : écrans filmés, et micro ouvert ou non (le mode parcours n'écoute pas). Avec `file`, elle lit
 * cette vidéo (parcours importé) à la place des écrans, comme un écran numéro TOUR_VIDEO_DISPLAY. */
export type VideoStart = { sources: VideoSource[]; audio: boolean; file?: Uint8Array };

/** Parcours depuis une vidéo (enregistrement d'écran d'iPhone…) : formats proposés et écran fictif qui la lit. */
export const TOUR_VIDEO_EXTENSIONS = ['mov', 'mp4', 'm4v'];
export const TOUR_VIDEO_DISPLAY = 0;

/** Lecture d'une vidéo importée, en secondes. */
export type TourVideoProgress = { time: number; duration: number; ended: boolean };

/** Progression d'un import (pages d'un document, secondes d'une vidéo). */
export type ImportProgress = { name: string; done: number; total: number; video?: boolean } | null;

/** Mode parcours : zone suivie, rectangle en 0–1 de son écran. */
export type TourRegion = { displayId: number; rect: { x: number; y: number; width: number; height: number } };

/** Image figée de la zone : profil pour l'assemblage (TOUR_PROFILE colonnes × toutes les lignes, en gris) et vignette. */
export type TourGrabbed = { width: number; height: number; profile: Uint8Array; thumb: Uint8Array };

/** Lignes [y, y + height) d'une image figée, gardées sous un numéro choisi par le processus principal. */
export type TourPiece = { id: number; y: number; height: number };

/** Morceau posé sur la page assemblée, étiré si la destination est plus grande. */
export type TourDraw = { piece: number; sx: number; sy: number; sw: number; sh: number; dx: number; dy: number; dw: number; dh: number };

/** Page assemblée : morceaux posés sur une image de width × height pixels, libérés ensuite. */
export type TourCompose = { composeId: number; width: number; height: number; draws: TourDraw[]; release: number[] };

export const TOUR_THUMB = { width: 128, height: 72 };
export const TOUR_PROFILE = 256; // colonnes du profil

/** Niveau RMS du micro au-dessus duquel quelqu'un parle (dictée de l'éditeur et mode vidéo). */
export const VOICE_RMS = 0.015;

/** Mesures d'une capture, affichées par la fenêtre POC. */
export type CaptureResult =
  | {
      ok: true;
      width: number; // pixels physiques
      height: number;
      scaleFactor: number;
      target: 'window' | 'screen' | 'zone';
      app?: string;
      title?: string;
      timings: {
        captureMs: number; // raccourci → écrans figés
        windowsMs: number; // raccourci → liste des fenêtres
        overlayMs: number; // raccourci → overlay affiché
        pickToSavedMs: number; // clic → image prête
      };
    }
  | { ok: false; error: string };

export type WhisperStatus =
  | { state: 'missing'; detail: string }
  | { state: 'loading' }
  | { state: 'ready'; loadMs: number }
  | { state: 'error'; detail: string };

export type TranscribeResult = { text: string; whisperMs: number; audioMs: number };

export type ExportFormat = 'pdf' | 'markdown' | 'pptx' | 'document';

/** État affiché par la fenêtre de réglages et l'assistant de premier lancement. */
export type SettingsState = SettingsView & {
  platform: 'mac' | 'win' | 'other';
  shortcutLabel: string;
  videoShortcutLabel: string; // raccourci fixe du mode vidéo, affiché
  shortcutOk: boolean;
  permissions: { screen: string; microphone: string; accessibility: string }; // granted, denied, not-determined…
  whisper: WhisperStatus;
  tabletPaired: boolean;
  tabletConnected: boolean;
  mcp: { url?: string; error?: string }; // serveur MCP pour Claude Code
  license: LicenseView;
  version: string; // version installée de l'app
};

/** Fenêtre d'appairage : le code QR (image) et l'état de la tablette. */
export type PairingState = { qr: string; connected: boolean };

export type SettingsTab = 'general' | 'permissions' | 'transcription' | 'export' | 'devices' | 'claude' | 'license';
export type ExportResult = { ok: true; path: string } | { ok: false; error: string };
export type ShareResult<T> = ({ ok: true } & T) | { ok: false; error: string };

/** Ce qu'affichent le menu de l'icône et la barre flottante. */
export type MenuState = {
  platform: 'mac' | 'win' | 'other';
  session: { name: string; points: number; screens: number; createdAt: string } | null;
  project: string; // projet en cours, où naît la prochaine revue
  tablet: boolean; // tablette connectée
  pending: number; // transcriptions en cours
  errors: number; // transcriptions en erreur
  shortcut: string; // raccourci de capture, affiché (« ⌃⌥⌘P »)
  video: { shortcut: string; since?: number }; // mode vidéo : raccourci affiché, début de l'enregistrement en cours (Date.now())
  tour?: { screens: number }; // mode parcours en cours : écrans gardés
  recents: SessionSummary[];
  update?: string; // version plus récente publiée
  license: LicenseView;
};

export type MenuAction =
  | { type: 'capture' | 'video' | 'tour' | 'tour-video' | 'open-document' | 'editor' | 'sessions' | 'export' | 'new-session' | 'pair' | 'claude-code' | 'settings' | 'quit' | 'close' | 'hide-bar' | 'reveal' | 'update' | 'license' }
  | { type: 'open-recent' | 'export-recent'; id: string };

/** Message de la barre flottante après un export. */
export type ExportNotice = { format: ExportFormat; file: string; copied: boolean };

/** Ce que l'éditeur doit montrer : une capture, et éventuellement un point avec sa bulle ouverte (dictée lancée ou non). */
export type EditorFocus = { captureId: string; annotationId?: string; openBubble?: boolean; dictate?: boolean };

export type PastilleApi = {
  // Éditeur
  getSession(): Promise<Session | null>;
  onSession(cb: (s: Session | null) => void): () => void;
  onFocus(cb: (f: EditorFocus) => void): () => void;
  addAnnotation(captureId: string, geometry: Geometry): Promise<string>;
  updateAnnotation(id: string, patch: { text?: string; geometry?: Geometry }): void;
  deleteAnnotation(id: string): void;
  discardAnnotation(id: string): void; // point resté vide (Échap) : retiré sans étape d'annulation
  updateSession(patch: { name?: string }): void;
  deleteCapture(id: string): void; // annulable par ⌘Z
  openSession(id: string): Promise<void>;
  trashSession(id: string): Promise<boolean>; // après confirmation ; faux si annulé
  moveSession(id: string, projectId: string): Promise<void>;
  // Projets
  listProjects(): Promise<ProjectSummary[]>;
  onProjects(cb: () => void): () => void; // liste des projets ou de leurs revues modifiée
  onShowProjects(cb: (projectId?: string) => void): () => void; // « Projets… » du menu de l'icône, projet importé
  createProject(name: string): Promise<string>;
  updateProject(id: string, patch: { name?: string; context?: string }): Promise<void>;
  newReview(projectId: string): Promise<void>;
  trashProject(id: string): Promise<boolean>; // après confirmation ; faux si annulé
  importProject(source?: File | string): Promise<ShareResult<{ report: ImportReport }> | null>; // fichier, lien collé ; rien : dialogue (null si annulé)
  saveProjectFile(id: string): Promise<ShareResult<{ path: string }> | null>;
  shareLink(id: string): Promise<ShareView | undefined>; // partage en ligne du projet, s'il existe
  publishLink(id: string): Promise<ShareResult<{ view: ShareView }>>; // partage en ligne, synchronisé ensuite
  revokeLink(id: string): Promise<ShareResult<object> | null>; // arrêter (créateur, après confirmation ; null si annulé) ou quitter
  onShareStatus(cb: (projectId: string) => void): () => void; // état d'un partage changé (synchronisation, envoi)
  addNote(): Promise<string>;
  updateNote(id: string, text: string): void;
  deleteNote(id: string): void;
  exportSession(format: ExportFormat): Promise<ExportResult>;
  openDocument(file?: File): void; // fichier déposé, ou choisi dans un dialogue
  onDocumentProgress(cb: (p: ImportProgress) => void): () => void;
  importTourVideo(file?: File): void; // parcours depuis une vidéo déposée, ou choisie dans un dialogue
  undo(): void;
  redo(): void;
  dictationAvailable(): Promise<boolean>;
  submitDictation(annotationId: string, samples: Float32Array): void; // point ou remarque générale
  retryDictation(annotationId: string): void;
  setRecording(recording: boolean): void;
  onPrepareMic(cb: () => void): () => void;
  setSelection(annotationId: string | null): void;
  deleteSketch(annotationId: string, sketchId: string): void;
  captureInspiration(annotationId: string): void; // éditeur masqué, la prochaine capture devient l'inspiration du point
  importInspiration(annotationId: string, png: Uint8Array): void; // image collée ou déposée
  deleteInspiration(annotationId: string, inspirationId: string): void;
  tabletStatus(): Promise<boolean>;
  onTabletStatus(cb: (connected: boolean) => void): () => void;
  // Réglages
  getSettings(): Promise<SettingsState>;
  updateSettings(patch: Partial<Settings>): Promise<{ ok: boolean; error?: string }>;
  setApiKey(key: string): Promise<void>;
  chooseExportDir(): Promise<string | undefined>;
  downloadModel(): Promise<{ ok: boolean; error?: string }>;
  onDownloadProgress(cb: (percent: number) => void): () => void;
  askPermission(kind: 'screen' | 'microphone' | 'accessibility'): Promise<void>;
  revokeTablet(): Promise<void>;
  pairTablet(): void;
  getPairing(): Promise<PairingState>;
  onSettingsChanged(cb: (s: SettingsState) => void): () => void;
  onSettingsTab(cb: (tab: SettingsTab) => void): () => void;
  openSettings(tab?: SettingsTab): void;
  copyText(text: string): void;
  onShortcutPressed(cb: () => void): () => void; // assistant de premier lancement
  activateLicense(key: string): Promise<{ ok: true } | { ok: false; error: string }>;
  openLicensePage(page: 'buy' | 'portal'): void; // site (tarifs) ou portail client Polar, dans le navigateur
  // Menu de l'icône et barre flottante
  getMenuState(): Promise<MenuState>;
  onMenuState(cb: (s: MenuState) => void): () => void;
  menuAction(action: MenuAction): void;
  menuResize(height: number): void;
  barHover(inside: boolean): void;
  onExportNotice(cb: (n: ExportNotice) => void): () => void;
  // Fenêtre POC
  onCaptureResult(cb: (r: CaptureResult) => void): () => void;
  startCapture(): void;
  toggleVideo(): void;
  toggleTour(): void;
  shortcutStatus(): Promise<{ accelerator: string; registered: boolean }>;
  whisperStatus(): Promise<WhisperStatus>;
  transcribe(samples: Float32Array): Promise<TranscribeResult>;
  transcribeSample(): Promise<TranscribeResult>;
  // Fenêtre cachée du mode vidéo
  onVideoStart(cb: (start: VideoStart) => void): () => void;
  videoStarted(error?: string): void; // flux et micro ouverts, ou l'erreur
  onVideoFreeze(cb: (f: { frameId: number; displayId: number }) => void): () => void;
  onVideoCrop(cb: (c: VideoCrop) => void): () => void;
  videoCropped(frameId: number, image: VideoImage | null): void;
  videoAudio(chunk: Float32Array): void; // micro, blocs de 100 ms à 16 kHz
  onVideoMic(cb: (on: boolean) => void): () => void; // clavier seul : couper ou rallumer le micro
  videoMicDone(error?: string): void;
  onVideoFeedback(cb: (state: VideoFeedback) => void): () => void;
  videoFeedbackHover(inside: boolean): void;
  videoAction(action: VideoAction): Promise<void>;
  videoText(text: string | null): Promise<void>; // fin du commentaire écrit ; null l'annule
  onVideoEndWriting(cb: () => void): () => void; // la page a défilé : envoyer le commentaire écrit
  // Fenêtre cachée, mode parcours
  onTourRegion(cb: (region: TourRegion | null) => void): () => void;
  tourThumb(thumb: Uint8Array): void; // vignette de la zone, à chaque image
  onTourGrab(cb: (g: { grabId: number }) => void): () => void;
  tourGrabbed(grabId: number, grabbed: TourGrabbed | null): void;
  onTourKeep(cb: (k: { grabId: number; pieces: TourPiece[] }) => void): () => void;
  onTourRelease(cb: (pieces: number[]) => void): () => void;
  onTourCompose(cb: (plan: TourCompose) => void): () => void;
  tourComposed(composeId: number, png: Uint8Array | null): void;
  tourVideo(p: TourVideoProgress): void; // vidéo importée : position chaque seconde, puis sa fin
  // Overlay
  onOverlayShow(cb: (data: OverlayShow) => void): void;
  onOverlayWindows(cb: (windows: OverlayWindow[]) => void): void;
  overlayReady(): void;
  overlayPick(pick: OverlayPick): void;
};

/** Les images de session sont servies par le protocole pastille:// (voir main/index.ts). */
export const imageUrl = (session: Session, relativePath: string) => `pastille://session/${session.id}/${relativePath}`;

declare global {
  interface Window {
    pastille: PastilleApi;
  }
}
