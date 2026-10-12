// Assemblage d'une page qu'on fait défiler (mode parcours). Deux images de la même zone, réduites en largeur
// seulement (une ligne du profil = une ligne de pixels, au pixel près), sont comparées : de combien le contenu
// a défilé, et ce qui n'a pas bougé (en-tête collant, pied de page, barre latérale, marges unies).
// Sans import d'electron : testé avec des images de synthèse.

/** Zone suivie, réduite à `width` colonnes et gardée sur toute sa hauteur, en niveaux de gris. */
export type Profile = { width: number; height: number; data: Uint8Array };

/** Défilement de `dy` lignes (positif : le contenu est monté, on descend dans la page). Lignes fixes en haut
 *  (`top`) et en bas (`bottom`) ; colonnes qui défilent de `left` à `right` (exclue), en colonnes du profil. */
export type Scroll = { dy: number; top: number; bottom: number; left: number; right: number };

const SAME = 2; // écart moyen (sur 255) sous lequel deux lignes ou deux colonnes sont identiques
const MATCH = 4; // écart moyen d'une ligne qui suit le défilement (curseur, barre de défilement tolérés)
const TEXTURE = 6; // écart moyen à sa propre moyenne d'une ligne qui porte quelque chose ; une ligne unie va avec tout décalage
const MIN_REGION = 48; // lignes qui défilent, au moins
const MIN_COLUMNS = 4;
const MIN_OVERLAP = 0.15; // recouvrement des deux images, en part de la zone qui défile
const MIN_TEXTURED = 12; // lignes non unies dans le recouvrement, au moins
const MATCHED = 0.9; // part de ces lignes qui doivent suivre le défilement
const BANDS = 8; // signature d'une ligne : moyennes de 8 bandes de colonnes
const CANDIDATES = 6; // meilleurs décalages de la signature, vérifiés au pixel près
const HINT = 4; // le décalage précédent est essayé d'abord, à ± 4 lignes près

/** Écart moyen entre la ligne `ra` de `a` et la ligne `rb` de `b`, sur les colonnes [c0, c1). */
function rowDiff(a: Profile, ra: number, b: Profile, rb: number, c0: number, c1: number): number {
  const oa = ra * a.width, ob = rb * b.width;
  let sum = 0;
  for (let c = c0; c < c1; c++) sum += Math.abs(a.data[oa + c]! - b.data[ob + c]!);
  return sum / (c1 - c0);
}

function colDiff(a: Profile, b: Profile, c: number, r0: number, r1: number): number {
  let sum = 0;
  for (let r = r0; r < r1; r++) sum += Math.abs(a.data[r * a.width + c]! - b.data[r * b.width + c]!);
  return sum / (r1 - r0);
}

/** Ligne qui porte du texte, un bord, une image : pas un aplat. */
function textured(p: Profile, r: number, c0: number, c1: number): boolean {
  const o = r * p.width;
  let mean = 0;
  for (let c = c0; c < c1; c++) mean += p.data[o + c]!;
  mean /= c1 - c0;
  let dev = 0;
  for (let c = c0; c < c1; c++) dev += Math.abs(p.data[o + c]! - mean);
  return dev / (c1 - c0) >= TEXTURE;
}

/** Défilement qui mène de `a` à `b`, ou null : rien n'a bougé, ou autre chose qu'un défilement vertical.
 *  `hint` : le décalage de la paire précédente, essayé d'abord (un défilement garde sa vitesse). */
export function findScroll(a: Profile, b: Profile, hint?: number): Scroll | null {
  if (a.width !== b.width || a.height !== b.height || !a.width || !a.height) return null;
  const W = a.width, H = a.height;

  // Lignes fixes en haut et en bas, puis colonnes fixes de part et d'autre.
  let top = 0;
  while (top < H && rowDiff(a, top, b, top, 0, W) <= SAME) top++;
  if (top === H) return null; // rien n'a bougé
  let bottom = 0;
  while (bottom < H - top && rowDiff(a, H - 1 - bottom, b, H - 1 - bottom, 0, W) <= SAME) bottom++;
  const r0 = top, r1 = H - bottom, n = r1 - r0;
  if (n < MIN_REGION) return null;
  let left = 0;
  while (left < W && colDiff(a, b, left, r0, r1) <= SAME) left++;
  let right = W;
  while (right > left && colDiff(a, b, right - 1, r0, r1) <= SAME) right--;
  if (right - left < MIN_COLUMNS) return null;

  const tex = new Uint8Array(H);
  for (let r = r0; r < r1; r++) tex[r] = textured(b, r, left, right) ? 1 : 0;
  const maxShift = n - Math.max(MIN_TEXTURED, Math.ceil(n * MIN_OVERLAP));
  if (maxShift < 1) return null;

  /** Lignes de b qui retrouvent leur place dans a après un décalage `dy` : seules les lignes non unies comptent. */
  const verified = (dy: number) => {
    let seen = 0, matched = 0;
    for (let r = Math.max(r0, r0 - dy); r < Math.min(r1, r1 - dy); r++) {
      if (!tex[r]) continue;
      seen++;
      if (rowDiff(a, r + dy, b, r, left, right) <= MATCH) matched++;
    }
    return seen >= MIN_TEXTURED && matched >= MATCHED * seen;
  };
  /** Écart moyen des lignes recouvertes, au pixel près. */
  const error = (dy: number) => {
    let sum = 0, rows = 0;
    for (let r = Math.max(r0, r0 - dy); r < Math.min(r1, r1 - dy); r++, rows++) sum += rowDiff(a, r + dy, b, r, left, right);
    return rows ? sum / rows : Infinity;
  };
  /** Meilleur décalage non nul de [from, to], vérifié, ou null. */
  const refine = (from: number, to: number) => {
    let best = 0, bestError = Infinity;
    for (let dy = Math.max(from, -maxShift); dy <= Math.min(to, maxShift); dy++) {
      if (!dy) continue;
      const e = error(dy);
      if (e < bestError) [best, bestError] = [dy, e];
    }
    return best && verified(best) ? best : null;
  };
  const result = (dy: number): Scroll => ({ dy, top, bottom, left, right });

  if (hint) {
    const dy = refine(hint - HINT, hint + HINT);
    if (dy) return result(dy);
  }

  // Recherche sur une signature par ligne (moyenne de quelques bandes de colonnes), à chaque décalage possible,
  // puis vérification au pixel près des meilleurs : un contenu régulier (lignes de texte au même pas) donne
  // plusieurs décalages presque aussi bons.
  const band = (right - left) / BANDS;
  const signature = (p: Profile) => {
    const out = new Float32Array(n * BANDS);
    for (let r = 0; r < n; r++) {
      const o = (r0 + r) * p.width;
      for (let c = left; c < right; c++) out[r * BANDS + Math.min(BANDS - 1, Math.floor((c - left) / band))]! += p.data[o + c]! / band;
    }
    return out;
  };
  const A = signature(a), B = signature(b);
  const best: { dy: number; error: number }[] = [];
  for (let dy = -maxShift; dy <= maxShift; dy++) {
    if (!dy) continue;
    const i0 = Math.max(0, -dy), i1 = Math.min(n, n - dy);
    const total = (i1 - i0) * BANDS;
    const limit = (best.length < CANDIDATES ? Infinity : best.at(-1)!.error) * total; // abandon dès qu'il ne peut plus en être
    let sum = 0;
    for (let i = i0; i < i1 && sum < limit; i++) {
      const oa = (i + dy) * BANDS, ob = i * BANDS;
      for (let k = 0; k < BANDS; k++) sum += Math.abs(A[oa + k]! - B[ob + k]!);
    }
    if (sum >= limit) continue;
    best.push({ dy, error: sum / total });
    best.sort((x, y) => x.error - y.error);
    if (best.length > CANDIDATES) best.pop();
  }
  for (const c of best) {
    const dy = refine(c.dy - 1, c.dy + 1);
    if (dy) return result(dy);
  }
  return null;
}
