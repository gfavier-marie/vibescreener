import { describe, expect, it } from 'vitest';
import { findScroll, type Profile } from './stitch.ts';

const W = 200;
const H = 600;

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
  for (let y = 0; y < height; y++) {
    if (y % 22 >= 14) continue;
    for (let x = 0; x < W; x++) data[y * W + x] = Math.floor(rnd() * 200);
  }
  return data;
}

type Layout = { header?: number; footer?: number; sidebar?: number };

/** Ce que montre la fenêtre quand la page est défilée de `pos` lignes : en-tête, pied et barre latérale fixes. */
function view(doc: Uint8Array, pos: number, { header = 0, footer = 0, sidebar = 0 }: Layout = {}): Profile {
  const data = new Uint8Array(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const fixed = y < header || y >= H - footer || x < sidebar;
      data[y * W + x] = fixed ? (x * 7 + y * 13) % 256 : doc[(pos + y) * W + x]!;
    }
  return { width: W, height: H, data };
}

describe('assemblage des pages défilées', () => {
  const doc = document(4000);

  it('trouve le défilement vers le bas', () => {
    expect(findScroll(view(doc, 0), view(doc, 137))).toMatchObject({ dy: 137, top: 0, bottom: 0, left: 0, right: W });
  });

  // Décalage à mi-chemin de deux groupes de la recherche grossière, sur un contenu au pas régulier.
  it.each([[0, 150], [750, 900], [900, 750], [100, 250]])('de %i à %i lignes', (from, to) => {
    expect(findScroll(view(doc, from), view(doc, to))?.dy).toBe(to - from);
  });

  it('laisse de côté en-tête collant, pied fixe et barre latérale', () => {
    const layout = { header: 60, footer: 40, sidebar: 30 };
    // 206 : sous l'en-tête, une ligne de texte remplace une ligne blanche (deux blancs à la même place compteraient comme fixes).
    expect(findScroll(view(doc, 0, layout), view(doc, 206, layout))).toEqual({ dy: 206, top: 60, bottom: 40, left: 30, right: W });
  });

  it('trouve un grand défilement tant que les images se recouvrent', () => {
    expect(findScroll(view(doc, 0), view(doc, 480))?.dy).toBe(480);
  });

  it("essaie d'abord le décalage précédent", () => {
    expect(findScroll(view(doc, 100), view(doc, 221), 118)?.dy).toBe(121);
  });

  it('rien quand rien ne bouge', () => {
    expect(findScroll(view(doc, 300), view(doc, 300))).toBeNull();
  });

  it("rien pour une autre page, ou des images qui ne se recouvrent plus", () => {
    expect(findScroll(view(doc, 0), view(document(4000, 7), 0))).toBeNull();
    expect(findScroll(view(doc, 0), view(doc, 1500))).toBeNull();
  });

  it("rien pour un menu qui s'ouvre par-dessus la page", () => {
    const before = view(doc, 0);
    const after = view(doc, 0);
    const rnd = random(3);
    for (let y = 100; y < 380; y++) for (let x = 40; x < 160; x++) after.data[y * W + x] = Math.floor(rnd() * 255);
    expect(findScroll(before, after)).toBeNull();
  });

  it("rien entre deux tailles d'image", () => {
    const small = { width: W, height: H - 10, data: new Uint8Array(W * (H - 10)) };
    expect(findScroll(view(doc, 0), small)).toBeNull();
  });
});
