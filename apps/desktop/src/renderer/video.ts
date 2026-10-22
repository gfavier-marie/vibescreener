// Fenêtre cachée du mode vidéo : filme chaque écran pour en garder la dernière image (celle d'avant
// un clic : la capture classique arriverait trop tard, après l'effet du clic), et envoie le micro
// au processus principal par blocs de 100 ms. Toute la logique reste dans le processus principal.
// Mode parcours (sans micro) : vignette de la zone suivie à chaque image, images figées dont le processus
// principal garde des bandes de lignes, puis pages assemblées en PNG (voir main/tour.ts).
// Parcours depuis une vidéo importée : elle est lue à vitesse réelle et tient lieu d'écran filmé.

import { TOUR_PROFILE, TOUR_THUMB, TOUR_VIDEO_DISPLAY, VIDEO_THUMB, type TourRegion, type VideoSource } from '../ipc.ts';

// Chromium lit les images d'un flux sans les afficher ; l'API n'est pas encore dans lib.dom.
declare class MediaStreamTrackProcessor<T> {
  constructor(init: { track: MediaStreamTrack });
  readonly readable: ReadableStream<T>;
}

const api = window.pastille;
const FRAME_RATE = 10; // images par seconde : assez pour l'état d'avant un clic, peu coûteux

type Screen = { latest: VideoFrame | null; at: number };
type Frozen = { bitmap: ImageBitmap; frozenAt: number; frameAgeMs: number } | null;
const screens = new Map<number, Screen>();
const frozen = new Map<number, Promise<Frozen>>();

/** Niveaux de gris d'une image RGBA (mêmes poids que partout ailleurs). */
function gray(rgba: Uint8ClampedArray): Uint8Array {
  const out = new Uint8Array(rgba.length / 4);
  for (let i = 0; i < out.length; i++) out[i] = Math.round(0.3 * rgba[4 * i]! + 0.59 * rgba[4 * i + 1]! + 0.11 * rgba[4 * i + 2]!);
  return out;
}

// ——— Mode parcours ———

let region: TourRegion | null = null;
const tourThumb = new OffscreenCanvas(TOUR_THUMB.width, TOUR_THUMB.height).getContext('2d')!;
const grabs = new Map<number, ImageBitmap>(); // images figées, en attente de tri
const pieces = new Map<number, ImageBitmap>(); // bandes gardées, jusqu'à l'assemblage de leur page
let work = Promise.resolve(); // bandes et assemblages dans l'ordre des demandes
const queue = (job: () => unknown) => void (work = work.then(job).then(() => {}, () => {}));

/** Zone suivie en pixels de l'image. */
function area(rect: TourRegion['rect'], width: number, height: number) {
  const sx = Math.min(width - 1, Math.max(0, Math.round(rect.x * width)));
  const sy = Math.min(height - 1, Math.max(0, Math.round(rect.y * height)));
  return { sx, sy, sw: Math.max(1, Math.min(width - sx, Math.round(rect.width * width))), sh: Math.max(1, Math.min(height - sy, Math.round(rect.height * height))) };
}

/** Vignette en gris d'une partie d'image : réduite sur le GPU, seuls ses pixels sont relus. */
function thumbOf(image: CanvasImageSource, sx: number, sy: number, sw: number, sh: number): Uint8Array {
  tourThumb.drawImage(image, sx, sy, sw, sh, 0, 0, TOUR_THUMB.width, TOUR_THUMB.height);
  return gray(tourThumb.getImageData(0, 0, TOUR_THUMB.width, TOUR_THUMB.height).data);
}

function release(ids: number[]) {
  for (const id of ids) {
    pieces.get(id)?.close();
    pieces.delete(id);
  }
}

// Nouvelle zone : une vignette part tout de suite (un écran immobile n'envoie plus d'images).
api.onTourRegion((r) => {
  region = r;
  const latest = r && screens.get(r.displayId)?.latest;
  if (!r || !latest) return;
  const { sx, sy, sw, sh } = area(r.rect, latest.displayWidth, latest.displayHeight);
  api.tourThumb(thumbOf(latest, sx, sy, sw, sh));
});

// Image figée : la zone entière est gardée, le processus principal reçoit son profil (réduit en largeur
// seulement, pour l'assemblage au pixel près) et sa vignette.
api.onTourGrab(async ({ grabId }) => {
  const r = region;
  const frame = r && screens.get(r.displayId)?.latest?.clone();
  if (!r || !frame) return api.tourGrabbed(grabId, null);
  try {
    const { sx, sy, sw, sh } = area(r.rect, frame.displayWidth, frame.displayHeight);
    const bitmap = await createImageBitmap(frame, sx, sy, sw, sh);
    const ctx = new OffscreenCanvas(TOUR_PROFILE, sh).getContext('2d')!;
    ctx.imageSmoothingQuality = 'medium';
    ctx.drawImage(bitmap, 0, 0, TOUR_PROFILE, sh);
    const profile = gray(ctx.getImageData(0, 0, TOUR_PROFILE, sh).data);
    grabs.set(grabId, bitmap);
    api.tourGrabbed(grabId, { width: sw, height: sh, profile, thumb: thumbOf(bitmap, 0, 0, sw, sh) });
  } catch {
    api.tourGrabbed(grabId, null);
  } finally {
    frame.close();
  }
});

// Bandes de lignes gardées sous les numéros du processus principal ; le reste de l'image est jeté.
api.onTourKeep(({ grabId, pieces: list }) =>
  queue(async () => {
    const bitmap = grabs.get(grabId);
    grabs.delete(grabId);
    if (!bitmap) return;
    const p = list[0];
    if (list.length === 1 && p!.y === 0 && p!.height === bitmap.height) return void pieces.set(p!.id, bitmap);
    for (const { id, y, height } of list) pieces.set(id, await createImageBitmap(bitmap, 0, y, bitmap.width, height));
    bitmap.close();
  }),
);

api.onTourRelease((ids) => queue(() => release(ids)));

// Page assemblée : morceaux posés (une ligne étirée prolonge une colonne fixe), en PNG.
api.onTourCompose((plan) =>
  queue(async () => {
    let png: Uint8Array | null = null;
    try {
      const ctx = new OffscreenCanvas(plan.width, plan.height).getContext('2d')!;
      ctx.imageSmoothingEnabled = false; // rien n'est réduit : pas de mélange au bord des morceaux
      for (const d of plan.draws) {
        const b = pieces.get(d.piece);
        if (b) ctx.drawImage(b, d.sx, d.sy, d.sw, d.sh, d.dx, d.dy, d.dw, d.dh);
      }
      png = new Uint8Array(await (await ctx.canvas.convertToBlob({ type: 'image/png' })).arrayBuffer());
    } catch {
      // page trop grande pour un canevas : le processus principal le note
    }
    release(plan.release);
    api.tourComposed(plan.composeId, png);
  }),
);

/** Nouvelle image d'un écran : elle remplace la précédente ; zone suivie, sa vignette part. */
function show(screen: Screen, displayId: number, frame: VideoFrame) {
  screen.latest?.close();
  screen.latest = frame;
  screen.at = performance.now();
  if (region?.displayId === displayId) {
    const { sx, sy, sw, sh } = area(region.rect, frame.displayWidth, frame.displayHeight);
    api.tourThumb(thumbOf(frame, sx, sy, sw, sh));
  }
}

/** Un flux par écran, à sa taille physique ; seule la dernière image est gardée. */
async function film(source: VideoSource) {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      mandatory: {
        chromeMediaSource: 'desktop',
        chromeMediaSourceId: source.sourceId,
        maxWidth: source.width,
        maxHeight: source.height,
        maxFrameRate: FRAME_RATE,
      },
    },
  } as unknown as MediaStreamConstraints);
  const screen: Screen = { latest: null, at: 0 };
  screens.set(source.displayId, screen);
  const reader = new MediaStreamTrackProcessor<VideoFrame>({ track: stream.getVideoTracks()[0]! }).readable.getReader();
  void (async () => {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) return;
      show(screen, source.displayId, value);
    }
  })();
}

/** Vidéo importée, lue sans le son à vitesse réelle : FRAME_RATE images par seconde, comme un écran filmé. */
async function play(file: Uint8Array) {
  const video = document.createElement('video');
  video.muted = true;
  video.src = URL.createObjectURL(new Blob([file as BlobPart]));
  await new Promise((resolve, reject) => {
    video.onloadeddata = resolve;
    video.onerror = () => reject(new Error(video.error?.message || `code ${video.error?.code}`));
  });
  const screen: Screen = { latest: null, at: 0 };
  screens.set(TOUR_VIDEO_DISPLAY, screen);
  await video.play();
  let second = 0;
  const timer = setInterval(() => {
    const { currentTime: time, duration } = video;
    if (video.ended) {
      clearInterval(timer);
      return api.tourVideo({ time: duration, duration, ended: true });
    }
    try {
      show(screen, TOUR_VIDEO_DISPLAY, new VideoFrame(video));
    } catch {
      // image pas encore décodée (début de la lecture) : la suivante viendra
    }
    if (Math.floor(time) !== second) api.tourVideo({ time, duration, ended: false });
    second = Math.floor(time);
  }, 1000 / FRAME_RATE);
}

/** Micro → PCM 16 kHz mono, comme la dictée de l'éditeur (même AudioWorklet). */
let mic: { audio: AudioContext; stream: MediaStream } | null = null;
async function listen() {
  if (mic) return;
  const audio = new AudioContext({ sampleRate: 16000 });
  try {
    await audio.audioWorklet.addModule(new URL('./pcm-worklet.js', document.baseURI).href);
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    const node = new AudioWorkletNode(audio, 'pcm-capture');
    node.port.onmessage = (e: MessageEvent<Float32Array>) => api.videoAudio(e.data);
    audio.createMediaStreamSource(stream).connect(node);
    node.connect(audio.destination); // le nœud ne produit que du silence
    mic = { audio, stream };
  } catch (err) {
    void audio.close();
    throw err;
  }
}

/** Clavier seul : le micro se ferme vraiment (voyant du système éteint). */
function mute() {
  if (!mic) return;
  for (const t of mic.stream.getTracks()) t.stop();
  void mic.audio.close();
  mic = null;
}

api.onVideoMic(async (on) => {
  try {
    if (on) await listen();
    else mute();
    api.videoMicDone();
  } catch (err) {
    api.videoMicDone(String(err));
  }
});

api.onVideoStart(async ({ sources, audio, file }) => {
  try {
    await Promise.all([...sources.map(film), ...(audio ? [listen()] : []), ...(file ? [play(file)] : [])]);
    api.videoStarted();
  } catch (err) {
    api.videoStarted(String(err));
  }
});

// Au clic : la dernière image de l'écran est copiée tout de suite, avant que l'app cliquée ne réagisse.
api.onVideoFreeze(({ frameId, displayId }) => {
  const screen = screens.get(displayId);
  const frame = screen?.latest?.clone();
  const frozenAt = Date.now();
  const frameAgeMs = screen ? performance.now() - screen.at : 0;
  frozen.set(
    frameId,
    frame
      ? createImageBitmap(frame).then(
          (bitmap) => ({ bitmap, frozenAt, frameAgeMs }),
          () => null,
        ).finally(() => frame.close())
      : Promise.resolve(null),
  );
});

/** Image figée recadrée (PNG) et sa vignette en niveaux de gris ; sans rectangle, elle est jetée. */
api.onVideoCrop(async ({ frameId, rect }) => {
  const f = await frozen.get(frameId);
  frozen.delete(frameId);
  if (!f || !rect) {
    f?.bitmap.close();
    return api.videoCropped(frameId, null);
  }
  const { bitmap } = f;
  const sx = Math.round(rect.x * bitmap.width);
  const sy = Math.round(rect.y * bitmap.height);
  const width = Math.max(1, Math.min(Math.round(rect.width * bitmap.width), bitmap.width - sx));
  const height = Math.max(1, Math.min(Math.round(rect.height * bitmap.height), bitmap.height - sy));
  const canvas = new OffscreenCanvas(width, height);
  canvas.getContext('2d')!.drawImage(bitmap, sx, sy, width, height, 0, 0, width, height);
  bitmap.close();
  const png = new Uint8Array(await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer());

  const small = new OffscreenCanvas(VIDEO_THUMB.width, VIDEO_THUMB.height);
  const ctx = small.getContext('2d')!;
  ctx.drawImage(canvas, 0, 0, VIDEO_THUMB.width, VIDEO_THUMB.height);
  const thumb = gray(ctx.getImageData(0, 0, VIDEO_THUMB.width, VIDEO_THUMB.height).data);

  api.videoCropped(frameId, { png, width, height, thumb, frozenAt: f.frozenAt, frameAgeMs: f.frameAgeMs });
});
