// Fusion de deux versions d'une même revue (projet synchronisé) : point par point. Écrans, points,
// croquis, inspirations et remarques sont réunis par id ; un même point modifié des deux côtés garde
// sa version la plus récente ; un élément supprimé d'un côté (id dans `deleted`) disparaît des deux.
// Le résultat ne dépend pas du côté qui fusionne : deux copies qui se sont échangé leurs versions
// deviennent identiques, et la synchronisation s'arrête.

import type { Capture, Session } from './model.ts';
import { renumber } from './session.ts';

/** Supprimé : l'id est gardé pour qu'une autre copie ne le fasse pas revenir. */
export function markDeleted(session: Session, ...ids: string[]) {
  session.deleted = [...new Set([...(session.deleted ?? []), ...ids])].sort();
}

type Item = { id: string; createdAt: string };

/** Ordre de création ; les pages d'un document créées dans la même milliseconde restent dans l'ordre des pages. */
const order = (a: Item, b: Item) =>
  a.createdAt.localeCompare(b.createdAt) ||
  ((a as Capture).source?.document?.page ?? 0) - ((b as Capture).source?.document?.page ?? 0) ||
  a.id.localeCompare(b.id);

/** JSON aux clés triées : deux contenus égaux donnent le même texte, quel que soit l'ordre de leurs clés. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(',')}}`;
  return JSON.stringify(value);
}

/** Version la plus récente ; à égalité, toujours la même des deux, quel que soit le côté. */
function newer<T extends { updatedAt: string }>(a: T, b: T): T {
  if (a.updatedAt !== b.updatedAt) return b.updatedAt > a.updatedAt ? b : a;
  return canonical(b) > canonical(a) ? b : a;
}

/** Réunit deux listes par id, sans les supprimés ; `pick` choisit entre deux versions d'un même élément. */
function union<T extends Item>(mine: T[], theirs: T[], gone: Set<string>, pick: (a: T, b: T) => T = (a) => a): T[] {
  const out = new Map(mine.map((x) => [x.id, x]));
  for (const x of theirs) out.set(x.id, out.has(x.id) ? pick(out.get(x.id)!, x) : x);
  return [...out.values()].filter((x) => !gone.has(x.id)).sort(order);
}

/**
 * Fait entrer `received` dans `target` (modifiée en place) : appliquée à la revue ouverte comme à son
 * historique d'annulation, elle ajoute les changements reçus sans défaire ceux d'ici.
 */
export function mergeSession(target: Session, received: Session): void {
  const theirs = structuredClone(received); // jamais partagée entre la revue et son historique
  const gone = new Set([...(target.deleted ?? []), ...(theirs.deleted ?? [])]);
  const named = newer({ updatedAt: target.updatedAt, name: target.name }, { updatedAt: theirs.updatedAt, name: theirs.name });
  target.name = named.name;
  target.captures = union(target.captures, theirs.captures, gone, (mine, other) => ({
    ...mine,
    annotations: union(mine.annotations, other.annotations, gone, (a, b) => ({
      ...newer(a, b),
      sketches: union(a.sketches, b.sketches, gone),
      ...((a.inspirations || b.inspirations) && { inspirations: union(a.inspirations ?? [], b.inspirations ?? [], gone) }),
    })),
  })).map((c) => ({
    ...c,
    annotations: c.annotations
      .filter((a) => !gone.has(a.id))
      .map((a) => ({
        ...a,
        sketches: a.sketches.filter((k) => !gone.has(k.id)),
        ...(a.inspirations && { inspirations: a.inspirations.filter((i) => !gone.has(i.id)) }),
      })),
  }));
  if (target.notes || theirs.notes) target.notes = union(target.notes ?? [], theirs.notes ?? [], gone, newer);
  if (gone.size) target.deleted = [...gone].sort();
  if (theirs.updatedAt > target.updatedAt) target.updatedAt = theirs.updatedAt;
  renumber(target);
}

/** Contenu d'une revue à comparer entre deux copies : sans la date de modification, que chaque enregistrement change. */
export function sessionContent(s: Session): string {
  return canonical({ ...s, updatedAt: undefined, projectId: undefined });
}
