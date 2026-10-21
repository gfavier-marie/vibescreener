// Fenêtre cachée du mode vidéo, vue du processus principal : elle filme chaque écran (pour figer
// l'image d'avant un clic) et écoute le micro. Les images figées attendent ici d'être recadrées ou jetées.
// Le mode parcours s'en sert aussi, sans micro : vignette de la zone suivie à chaque image, images figées
// dont on garde des bandes de lignes, pages assemblées (voir tour.ts).

import { BrowserWindow, desktopCapturer, ipcMain, screen } from 'electron';
import type { TourCompose, TourGrabbed, TourPiece, TourRegion, TourVideoProgress, VideoCrop, VideoImage, VideoSource, VideoStart } from '../ipc.ts';
import type { TourGrab } from './tour.ts';
import { T } from '../texts/index.ts';

export type VideoWindowOptions = {
  preload: string;
  loadPage: (win: BrowserWindow, page: 'video') => void;
  onAudio: (chunk: Float32Array) => void;
  onTourThumb?: (thumb: Uint8Array) => void;
  onTourVideo?: (p: TourVideoProgress) => void;
};

export function createVideoWindow(opts: VideoWindowOptions) {
  let win: BrowserWindow | null = null;
  let started: ((error?: string) => void) | null = null;
  let nextFrame = 1;
  const waiting = new Map<number, (image: VideoImage | null) => void>();
  let nextTour = 1;
  const grabbing = new Map<number, (g: TourGrab | null) => void>();
  const composing = new Map<number, (png: Uint8Array | null) => void>();

  const fromWindow = (sender: Electron.WebContents) => !!win && !win.isDestroyed() && sender === win.webContents;
  ipcMain.on('video:started', (e, error?: string) => fromWindow(e.sender) && started?.(error));
  ipcMain.on('video:audio', (e, chunk: Float32Array) => fromWindow(e.sender) && opts.onAudio(chunk));
  ipcMain.on('video:cropped', (_e, frameId: number, image: VideoImage | null) => {
    waiting.get(frameId)?.(image);
    waiting.delete(frameId);
  });
  ipcMain.on('tour:thumb', (e, thumb: Uint8Array) => fromWindow(e.sender) && opts.onTourThumb?.(thumb));
  ipcMain.on('tour:video', (e, p: TourVideoProgress) => fromWindow(e.sender) && opts.onTourVideo?.(p));
  ipcMain.on('tour:grabbed', (e, grabId: number, g: TourGrabbed | null) => {
    if (!fromWindow(e.sender)) return;
    grabbing.get(grabId)?.(g && { ...g, grabId });
    grabbing.delete(grabId);
  });
  ipcMain.on('tour:composed', (e, composeId: number, png: Uint8Array | null) => {
    if (!fromWindow(e.sender)) return;
    composing.get(composeId)?.(png);
    composing.delete(composeId);
  });

  /** Ouvre un flux par écran et le micro (sauf `audio: false`), ou lit la vidéo `file` à la place des écrans ;
   * rejette avec un message à montrer. */
  async function start({ audio = true, file }: { audio?: boolean; file?: Uint8Array } = {}): Promise<void> {
    stop();
    const list: VideoSource[] = [];
    if (!file) {
      const displays = screen.getAllDisplays();
      // Pas de vignettes : seuls les identifiants des écrans servent.
      const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 0, height: 0 } }).catch(() => []);
      displays.forEach((d, i) => {
        const src = sources.find((s) => s.display_id === String(d.id)) ?? sources[i];
        if (src) list.push({ displayId: d.id, sourceId: src.id, width: Math.round(d.size.width * d.scaleFactor), height: Math.round(d.size.height * d.scaleFactor) });
      });
      if (list.length < displays.length) {
        throw new Error(process.platform === 'darwin' ? T.main.video.denied : T.main.video.unreadable);
      }
    }

    const w = new BrowserWindow({
      show: false,
      width: 320,
      height: 200,
      skipTaskbar: true,
      // Cachée pendant tout l'enregistrement : rien ne doit y être ralenti.
      webPreferences: { preload: opts.preload, backgroundThrottling: false },
    });
    w.setContentProtection(true);
    win = w;
    opts.loadPage(w, 'video');
    await new Promise<void>((r) => w.webContents.once('did-finish-load', () => r()));
    const error = await new Promise<string | undefined>((resolve) => {
      started = resolve;
      w.webContents.send('video:start', { sources: list, audio, file } satisfies VideoStart);
      setTimeout(() => resolve(T.main.video.noResponse), 15_000);
    });
    started = null;
    if (error) {
      stop();
      throw new Error(file ? T.main.tourVideo.unreadable(error) : T.main.video.failed(error));
    }
  }

  /** Fige la dernière image d'un écran ; renvoie son numéro, à recadrer ou jeter ensuite. */
  function freeze(displayId: number): number {
    const frameId = nextFrame++;
    if (win && !win.isDestroyed()) win.webContents.send('video:freeze', { frameId, displayId });
    return frameId;
  }

  /** Image figée recadrée (rectangle en 0–1 de l'écran), ou jetée (null). */
  function crop(frameId: number, rect: VideoCrop['rect']): Promise<VideoImage | null> {
    if (!win || win.isDestroyed()) return Promise.resolve(null);
    const w = win;
    return new Promise((resolve) => {
      waiting.set(frameId, resolve);
      w.webContents.send('video:crop', { frameId, rect } satisfies VideoCrop);
    });
  }

  const send = (channel: string, data: unknown) => win && !win.isDestroyed() && win.webContents.send(channel, data);

  /** Mode parcours : zone suivie, dont la fenêtre envoie une vignette à chaque image. */
  const tourRegion = (region: TourRegion | null) => send('tour:region', region);

  /** Fige la dernière image de la zone : profil et vignette ; l'image attend `tourKeep`. */
  function tourGrab(): Promise<TourGrab | null> {
    if (!win || win.isDestroyed()) return Promise.resolve(null);
    const grabId = nextTour++;
    return new Promise((resolve) => {
      grabbing.set(grabId, resolve);
      send('tour:grab', { grabId });
    });
  }

  const tourKeep = (grabId: number, pieces: TourPiece[]) => send('tour:keep', { grabId, pieces });
  const tourRelease = (pieces: number[]) => send('tour:release', pieces);

  /** Page assemblée en PNG, ou null. */
  function tourCompose(plan: Omit<TourCompose, 'composeId'>): Promise<Uint8Array | null> {
    if (!win || win.isDestroyed()) return Promise.resolve(null);
    const composeId = nextTour++;
    return new Promise((resolve) => {
      composing.set(composeId, resolve);
      send('tour:compose', { ...plan, composeId } satisfies TourCompose);
    });
  }

  /** Ferme la fenêtre : flux, micro et images gardées s'en vont avec elle. */
  function stop() {
    if (win && !win.isDestroyed()) win.destroy();
    win = null;
    for (const resolve of waiting.values()) resolve(null);
    waiting.clear();
    for (const resolve of grabbing.values()) resolve(null);
    grabbing.clear();
    for (const resolve of composing.values()) resolve(null);
    composing.clear();
  }

  return { start, freeze, crop, stop, tourRegion, tourGrab, tourKeep, tourRelease, tourCompose };
}
