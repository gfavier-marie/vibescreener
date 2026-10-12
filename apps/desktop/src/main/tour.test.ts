import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TOUR_PROFILE, TOUR_THUMB, type TourCompose, type TourPiece } from '../ipc.ts';
import { createTour, type TourCheck, type TourDeps } from './tour.ts';

const W = TOUR_PROFILE; // colonnes du profil
const H = 400; // lignes de la zone
const PX = 2 * W; // largeur de la zone en pixels : une colonne du profil = 2 pixels

/** Générateur pseudo-aléatoire répétable (mulberry32). */
function random(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), seed | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Longue page de « texte » : lignes de 14 px séparées par 8 px de blanc. */
function document(height: number, seed = 1): Uint8Array {
  const rnd = random(seed);
  const data = new Uint8Array(height * W).fill(245);
  for (let y = 0; y < height; y++) if (y % 22 < 14) for (let x = 0; x < W; x++) data[y * W + x] = Math.floor(rnd() * 200);
  return data;
}

type Screen = { data: Uint8Array };

/** Fenêtre sur la page défilée de `pos` lignes, avec un en-tête fixe éventuel. */
function view(doc: Uint8Array, pos: number, header = 0): Screen {
  const data = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) data[y * W + x] = y < header ? (x * 7 + y * 13) % 256 : doc[(pos + y) * W + x]!;
  return { data };
}

/** Même écran, avec un rectangle uni par-dessus (menu, survol). */
function withBlock(s: Screen, x0: number, y0: number, w: number, h: number): Screen {
  const data = s.data.slice();
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) data[y * W + x] = 0;
  return { data };
}

const thumbOf = (s: Screen) => {
  const t = new Uint8Array(TOUR_THUMB.width * TOUR_THUMB.height);
  for (let i = 0; i < TOUR_THUMB.height; i++)
    for (let j = 0; j < TOUR_THUMB.width; j++)
      t[i * TOUR_THUMB.width + j] = s.data[Math.floor((i * H) / TOUR_THUMB.height) * W + Math.floor((j * W) / TOUR_THUMB.width)]!;
  return t;
};

function setup() {
  let screen: Screen | null = null;
  let grabs = 0;
  let checkState: TourCheck = { state: 'ok', app: 'Safari', title: 'Accueil' };
  const kept: { grabId: number; pieces: TourPiece[] }[] = [];
  const plans: Omit<TourCompose, 'composeId'>[] = [];
  const released: number[] = [];
  const saved: { height: number; title?: string }[] = [];
  const deps: TourDeps = {
    grab: async () => screen && { grabId: ++grabs, width: PX, height: H, profile: screen.data, thumb: thumbOf(screen) },
    keep: (grabId, pieces) => kept.push({ grabId, pieces }),
    compose: async (plan) => {
      plans.push(plan);
      return new Uint8Array([1]);
    },
    release: (pieces) => released.push(...pieces),
    check: async () => checkState,
    save: async (_png, page) => {
      saved.push({ height: page.height, title: page.title });
      return `capture-${saved.length}`;
    },
  };
  const tour = createTour(deps);
  tour.start();
  /** L'écran change : une image arrive, puis on attend (assez longtemps pour le repos, par défaut). */
  const show = async (s: Screen, waitMs = 300) => {
    screen = s;
    tour.onThumb(thumbOf(s));
    await vi.advanceTimersByTimeAsync(waitMs);
  };
  return { tour, show, kept, plans, released, saved, setCheck: (c: TourCheck) => (checkState = c) };
}

describe('mode parcours', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());
  const doc = document(4000);

  it('un état qui reste affiché devient une capture', async () => {
    const t = setup();
    await t.show(view(doc, 0));
    expect(t.tour.screens()).toBe(1);
    const summary = await t.tour.stop();
    expect(summary).toEqual({ firstCaptureId: 'capture-1', screens: 1 });
    expect(t.saved).toEqual([{ height: H, title: 'Accueil' }]);
    expect(t.plans[0]).toMatchObject({ width: PX, height: H, draws: [{ sx: 0, sy: 0, sw: PX, sh: H, dx: 0, dy: 0 }] });
  });

  it("rien tant que l'écran bouge", async () => {
    const t = setup();
    await t.show(view(doc, 0), 100);
    await t.show(view(doc, 700, 0), 100);
    expect(t.tour.screens()).toBe(0);
  });

  it('une page défilée est assemblée en une seule image', async () => {
    const t = setup();
    await t.show(view(doc, 0));
    await t.show(view(doc, 250), 50); // pendant le défilement
    await t.show(view(doc, 500), 50);
    await t.show(view(doc, 600));
    await t.tour.stop();
    expect(t.saved).toHaveLength(1);
    expect(t.plans[0]!.height).toBe(H + 600);
    // Nouvelles lignes seulement : 250, 250, puis 100.
    expect(t.kept.slice(1).filter((k) => k.pieces.length).map((k) => k.pieces.map((p) => p.height))).toEqual([[250], [250], [100]]);
    expect(t.plans[0]!.release).toHaveLength(4);
  });

  it('en-tête collant : gardé une fois en haut, le contenu défile dessous', async () => {
    const t = setup();
    await t.show(view(doc, 0, 50));
    await t.show(view(doc, 206, 50));
    await t.tour.stop();
    const plan = t.plans[0]!;
    expect(plan.height).toBe(H + 206);
    expect(plan.draws[0]).toMatchObject({ sy: 0, sh: 50, dy: 0 }); // en-tête de la première image
    expect(plan.draws.at(-1)).toMatchObject({ sy: 0, sh: 206, dy: H }); // lignes ajoutées sous la première image
  });

  it('un menu ouvert puis refermé : deux captures, la page reprend où elle en était', async () => {
    const t = setup();
    await t.show(view(doc, 0));
    await t.show(withBlock(view(doc, 0), 40, 100, 120, 200)); // menu
    await t.show(view(doc, 0)); // refermé
    expect(t.tour.screens()).toBe(2);
    await t.show(view(doc, 300)); // la page continue de s'assembler
    await t.tour.stop();
    expect(t.saved.map((s) => s.height)).toEqual([H + 300, H]);
  });

  it("un écran déjà enregistré n'est pas répété", async () => {
    const t = setup();
    const other = document(4000, 9);
    await t.show(view(doc, 0)); // A
    await t.show(view(other, 0)); // B
    await t.show(view(other, 1000)); // C : A est enregistrée
    await t.show(view(doc, 0)); // A revue
    await t.tour.stop();
    expect(t.saved).toHaveLength(3);
  });

  it('un survol ne fait pas de nouvel écran', async () => {
    const t = setup();
    await t.show(view(doc, 0));
    await t.show(withBlock(view(doc, 0), 100, 100, 20, 50));
    await t.tour.stop();
    expect(t.saved).toHaveLength(1);
  });

  it('fenêtre recouverte par une autre app : rien de gardé, puis reprise', async () => {
    const t = setup();
    t.setCheck({ state: 'hidden' });
    await t.show(view(doc, 0));
    expect(t.tour.screens()).toBe(0);
    t.setCheck({ state: 'ok' });
    // Revérifiée, puis relue au repos sans attendre une nouvelle image (un écran immobile n'en envoie plus).
    await vi.advanceTimersByTimeAsync(1300);
    expect(t.tour.screens()).toBe(1);
  });

  it('page trop haute : la suite devient une autre capture', async () => {
    const t = setup();
    await t.show(view(doc, 0));
    for (let pos = 300; pos <= 2400; pos += 300) await t.show(view(doc, pos), 50);
    await t.tour.stop();
    expect(t.saved).toHaveLength(2);
    expect(Math.max(...t.saved.map((s) => s.height))).toBeLessThanOrEqual(5 * H);
  });
});
