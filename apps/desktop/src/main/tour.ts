// Mode parcours : on se promène dans une fenêtre choisie ; chaque état qui reste affiché un instant devient une
// capture, et une page qu'on fait défiler est assemblée en une seule image haute (voir stitch.ts).
// La fenêtre cachée envoie une vignette de la zone à chaque image (10 par seconde). Pendant un mouvement et au
// repos, une image est figée : défilement de la page en cours (ses nouvelles lignes sont gardées), même écran
// (rien), ou autre état (nouvelle page, après avoir vérifié que la fenêtre est toujours devant).
// La page précédente reste ouverte : un menu ouvert puis refermé fait reprendre la page où elle en était.
// Sans import d'electron : testé avec des images factices.

import { TOUR_PROFILE, type TourCompose, type TourDraw, type TourGrabbed, type TourPiece } from '../ipc.ts';
import { findScroll, type Profile, type Scroll } from './stitch.ts';
import { sameScreen } from './video.ts';

const STABLE_MS = 250; // aucun mouvement pendant ce temps : l'état est stable (un écran immobile n'envoie plus d'images)
const PIXEL_DIFF = 24; // écart de gris (sur 255) d'un pixel de vignette qui a changé
const MOTION_RATIO = 0.002; // part de la vignette qui change pour un mouvement : le curseur seul n'y suffit pas
const MAX_PAGE_SCREENS = 5; // hauteur d'une page assemblée, en hauteurs de fenêtre ; la suite va sur une autre capture
const HIDDEN_RETRY_MS = 1000; // fenêtre recouverte ou absente : nouvel essai

export type TourGrab = TourGrabbed & { grabId: number };

/** La fenêtre suivie : devant et à sa place, recouverte par une autre app (ou absente), ou déplacée (zone mise à jour). */
export type TourCheck = { state: 'ok'; app?: string; title?: string } | { state: 'hidden' | 'moved' };

export type TourPage = { width: number; height: number; app?: string; title?: string };

export type TourDeps = {
  /** Fige la dernière image de la zone ; null si elle n'est pas disponible. */
  grab: () => Promise<TourGrab | null>;
  /** Garde des bandes de lignes de l'image figée, sous les numéros donnés, et jette le reste. */
  keep: (grabId: number, pieces: TourPiece[]) => void;
  /** Page assemblée, en PNG ; les morceaux de `release` sont libérés ensuite. */
  compose: (plan: Omit<TourCompose, 'composeId'>) => Promise<Uint8Array | null>;
  release: (pieces: number[]) => void;
  check: () => Promise<TourCheck>;
  /** Enregistre une page ; renvoie l'identifiant de la capture. */
  save: (png: Uint8Array, page: TourPage) => Promise<string>;
  onChange?: () => void; // nombre d'écrans changé
  log?: (entry: Record<string, unknown>) => void;
};

export type TourSummary = { firstCaptureId?: string; screens: number };

type Frame = { profile: Profile; thumb: Uint8Array };
type Page = TourPage & {
  id: number;
  first: number; // morceau : la première image, entière
  last: Frame; // dernière image gardée, à laquelle la suivante est comparée
  lastDy?: number;
  thumbs: Uint8Array[]; // vignettes des images gardées
  pos: number; // décalage de la dernière image gardée par rapport à la première
  // Dès le premier défilement : lignes fixes en haut et en bas, colonnes qui défilent (pixels), et
  // contenu couvert [min, max) en lignes de la première image.
  scroll?: { top: number; bottom: number; left: number; right: number; min: number; max: number };
  strips: { piece: number; at: number; height: number }[]; // contenu ajouté, à sa place
  tail?: number; // morceau : lignes fixes du bas de la dernière image gardée
};

/** Assez de pixels de la vignette ont changé pour un mouvement. */
export function moved(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return true;
  let changed = 0;
  for (let i = 0; i < a.length; i++) if (Math.abs(a[i]! - b[i]!) > PIXEL_DIFF) changed++;
  return changed > a.length * MOTION_RATIO;
}

/** Plan d'assemblage d'une page : en-tête de la première image, contenu, pied de la dernière ; à côté du
 *  contenu ajouté, les colonnes fixes sont prolongées en étirant la ligne de la première image qui le borde. */
function composePlan(p: Page): Omit<TourCompose, 'composeId'> {
  const W = p.width, H = p.height;
  const release = [p.first, ...p.strips.map((s) => s.piece), ...(p.tail ? [p.tail] : [])];
  const draw = (piece: number, sx: number, sy: number, sw: number, sh: number, dx: number, dy: number, dh = sh): TourDraw =>
    ({ piece, sx, sy, sw, sh, dx, dy, dw: sw, dh });
  const s = p.scroll;
  if (!s) return { width: W, height: H, draws: [draw(p.first, 0, 0, W, H, 0, 0)], release };

  const y = (line: number) => s.top + line - s.min; // ligne de la page assemblée
  const draws: TourDraw[] = [];
  if (s.top) draws.push(draw(p.first, 0, 0, W, s.top, 0, 0));
  draws.push(draw(p.first, 0, s.top, W, H - s.top - s.bottom, 0, y(s.top)));
  for (const strip of p.strips) draws.push(draw(strip.piece, s.left, 0, s.right - s.left, strip.height, s.left, y(strip.at)));
  const sides = [[0, s.left], [s.right, W]].filter(([a, b]) => b! > a!) as [number, number][];
  for (const [x0, x1] of sides) {
    if (s.max > H - s.bottom) draws.push(draw(p.first, x0, H - s.bottom - 1, x1 - x0, 1, x0, y(H - s.bottom), s.max - (H - s.bottom)));
    if (s.min < s.top) draws.push(draw(p.first, x0, s.top, x1 - x0, 1, x0, y(s.min), s.top - s.min));
  }
  if (s.bottom && p.tail) draws.push(draw(p.tail, 0, 0, W, s.bottom, 0, y(s.max)));
  return { width: W, height: s.top + s.max - s.min + s.bottom, draws, release };
}

export function createTour(deps: TourDeps) {
  const log = (entry: Record<string, unknown>) => deps.log?.(entry);
  let recording = false;
  let startedAt = 0;
  let current: Page | null = null;
  let previous: Page | null = null;
  let lastThumb: Uint8Array | null = null; // vignette du dernier mouvement
  let settle: ReturnType<typeof setTimeout> | undefined;
  let hidden = false;
  let want: 'moving' | 'settled' | null = null;
  let pumping: Promise<void> | null = null;
  let chain = Promise.resolve(); // pages assemblées et enregistrées dans l'ordre
  let nextPiece = 1;
  let nextPage = 1;
  // Écrans déjà enregistrés, pour ne pas répéter un état revu (une page sans défilement qui leur est identique).
  let saved: { width: number; height: number; thumb: Uint8Array }[] = [];
  let summary: TourSummary = { screens: 0 };

  const fits = (p: Page, g: TourGrab) => p.width === g.width && p.height === g.height;
  const duplicate = (p: Page) =>
    !p.scroll && saved.some((s) => s.width === p.width && s.height === p.height && sameScreen(s.thumb, p.thumbs[0]!));

  function settleSoon() {
    clearTimeout(settle);
    settle = setTimeout(() => request('settled'), STABLE_MS);
  }

  function request(kind: 'moving' | 'settled') {
    if (want !== 'settled') want = kind;
    pumping ??= pump().finally(() => (pumping = null));
  }

  /** Une image figée à la fois ; la suivante est demandée dès la réponse. */
  async function pump() {
    while (want && recording) {
      const kind = want;
      want = null;
      const g = await deps.grab();
      if (g) await handle(g, kind).catch((err) => log({ error: String(err) }));
    }
  }

  async function handle(g: TourGrab, kind: 'moving' | 'settled') {
    const frame: Frame = { profile: { width: TOUR_PROFILE, height: g.height, data: g.profile }, thumb: g.thumb };
    const page = current;
    if (page && fits(page, g)) {
      const t0 = performance.now();
      const s = findScroll(page.last.profile, frame.profile, page.lastDy);
      const findScrollMs = Math.round(performance.now() - t0);
      if (s) {
        log({ kind, scroll: s, findScrollMs });
        if (scrollTo(page, g, frame, s)) return;
        // Page trop haute : la suite devient une autre capture, qui commence par cette image.
        return startPage(g, frame, page);
      }
      if (sameScreen(page.last.thumb, frame.thumb)) return deps.keep(g.grabId, []);
      log({ kind, changed: true, findScrollMs });
    }
    if (kind === 'moving') return deps.keep(g.grabId, []); // entre deux états : on attend le repos

    // Autre état, au repos : la fenêtre doit être toujours là, devant et à sa place.
    const t0 = performance.now();
    const w = await deps.check();
    log({ check: w.state, checkMs: Math.round(performance.now() - t0) });
    if (w.state !== 'ok') {
      deps.keep(g.grabId, []);
      lastThumb = null; // la zone a pu changer : on repart d'un mouvement
      if (w.state === 'hidden') hide();
      return;
    }
    if (previous && fits(previous, g) && sameScreen(previous.last.thumb, frame.thumb)) {
      // Retour à la page précédente (menu refermé, par exemple) : elle reprend où elle en était.
      [current, previous] = [previous, current];
      log({ resumed: current!.id });
      return deps.keep(g.grabId, []);
    }
    startPage(g, frame, w);
  }

  /** Défilement de la page : ses nouvelles lignes sont gardées. Faux si la page deviendrait trop haute. */
  function scrollTo(page: Page, g: TourGrab, frame: Frame, s: Scroll): boolean {
    const H = page.height;
    const px = (col: number, round: (v: number) => number) => round((col * page.width) / TOUR_PROFILE);
    const sc = page.scroll ?? { top: s.top, bottom: s.bottom, left: px(s.left, Math.floor), right: px(s.right, Math.ceil), min: s.top, max: H - s.bottom };
    const pos = page.pos + s.dy;
    const from = pos + sc.top, to = pos + H - sc.bottom; // contenu visible dans la nouvelle image
    if (to < sc.min || from > sc.max) return false; // rien de commun avec ce qui est déjà gardé
    if (sc.top + sc.bottom + Math.max(sc.max, to) - Math.min(sc.min, from) > MAX_PAGE_SCREENS * H) return false;

    const pieces: TourPiece[] = [];
    if (to > sc.max) {
      const id = nextPiece++;
      pieces.push({ id, y: sc.max - pos, height: to - sc.max });
      page.strips.push({ piece: id, at: sc.max, height: to - sc.max });
      sc.max = to;
    }
    if (from < sc.min) {
      const id = nextPiece++;
      pieces.push({ id, y: sc.top, height: sc.min - from });
      page.strips.push({ piece: id, at: from, height: sc.min - from });
      sc.min = from;
    }
    if (sc.bottom) {
      if (page.tail) deps.release([page.tail]);
      page.tail = nextPiece++;
      pieces.push({ id: page.tail, y: H - sc.bottom, height: sc.bottom });
    }
    page.scroll = sc;
    page.pos = pos;
    page.lastDy = s.dy;
    page.last = frame;
    page.thumbs.push(frame.thumb);
    deps.keep(g.grabId, pieces);
    return true;
  }

  /** Nouvelle page sur cette image ; l'avant-dernière est assemblée et enregistrée. */
  function startPage(g: TourGrab, frame: Frame, meta: { app?: string; title?: string }) {
    if (previous) close(previous);
    previous = current;
    const first = nextPiece++;
    current = { id: nextPage++, width: g.width, height: g.height, app: meta.app, title: meta.title, first, last: frame, thumbs: [frame.thumb], pos: 0, strips: [] };
    deps.keep(g.grabId, [{ id: first, y: 0, height: g.height }]);
    log({ page: current.id, width: g.width, height: g.height, duplicate: duplicate(current) });
    deps.onChange?.();
  }

  function close(page: Page) {
    const plan = composePlan(page);
    if (duplicate(page)) {
      deps.release(plan.release);
      log({ closed: page.id, duplicate: true });
      return;
    }
    for (const thumb of page.thumbs) saved.push({ width: page.width, height: page.height, thumb });
    summary.screens++;
    chain = chain
      .then(async () => {
        const png = await deps.compose(plan);
        if (!png) return log({ closed: page.id, error: 'assemblage impossible' });
        const id = await deps.save(png, { width: plan.width, height: plan.height, app: page.app, title: page.title });
        summary.firstCaptureId ??= id;
        log({ closed: page.id, width: plan.width, height: plan.height, strips: page.strips.length });
      })
      .catch((err) => log({ error: String(err) }));
  }

  /** Fenêtre recouverte ou absente : en pause, revérifiée régulièrement. */
  function hide() {
    if (hidden) return;
    hidden = true;
    const retry = async () => {
      if (!recording || !hidden) return;
      const w = await deps.check();
      if (!recording) return;
      if (w.state === 'ok') {
        hidden = false;
        lastThumb = null;
        log({ visible: true });
        settleSoon(); // l'écran peut ne plus bouger : il est relu au repos
      } else setTimeout(() => void retry(), HIDDEN_RETRY_MS);
    };
    setTimeout(() => void retry(), HIDDEN_RETRY_MS);
  }

  return {
    isRecording: () => recording,
    startedAt: () => startedAt,
    /** Écrans gardés jusqu'ici, pages ouvertes comprises (sauf un état déjà enregistré). */
    screens: () => summary.screens + [previous, current].filter((p) => p && !duplicate(p)).length,

    start() {
      recording = true;
      startedAt = Date.now();
      current = previous = null;
      lastThumb = null;
      hidden = false;
      want = null;
      saved = [];
      summary = { screens: 0 };
    },

    /** Vignette de la zone, à chaque image filmée. Comparée à celle du dernier mouvement : un changement lent
     *  finit par compter. */
    onThumb(thumb: Uint8Array) {
      if (!recording || hidden || (lastThumb && !moved(lastThumb, thumb))) return;
      lastThumb = thumb;
      settleSoon();
      if (current) request('moving'); // défilement en cours : les images intermédiaires gardent le recouvrement
    },

    /** Arrête, puis assemble et enregistre les pages encore ouvertes. */
    async stop(): Promise<TourSummary> {
      if (!recording) return summary;
      recording = false;
      want = null;
      clearTimeout(settle);
      await pumping;
      const open = [previous, current].filter((p): p is Page => !!p).sort((a, b) => a.id - b.id);
      current = previous = null;
      for (const page of open) close(page);
      await chain;
      return summary;
    },
  };
}
