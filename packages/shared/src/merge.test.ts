import { describe, expect, it } from 'vitest';
import { markDeleted, mergeSession, sessionContent } from './merge.ts';
import type { Annotation, Capture, Session } from './model.ts';

const at = (n: number) => new Date(Date.UTC(2026, 9, 19, 10, 0, n)).toISOString();
const point = (id: string, t: number, text = id): Annotation => ({
  id,
  number: 0,
  geometry: { kind: 'point', x: 0.5, y: 0.5 },
  text,
  input: 'typed',
  transcription: 'none',
  sketches: [],
  createdAt: at(t),
  updatedAt: at(t),
});
const screen = (id: string, t: number, annotations: Annotation[] = []): Capture => ({
  id,
  createdAt: at(t),
  image: `captures/${id}.png`,
  width: 100,
  height: 100,
  scaleFactor: 1,
  annotations,
});
const session = (captures: Capture[], t = 0): Session => ({ id: 's', name: 'Revue', createdAt: at(0), updatedAt: at(t), captures });

/** Les deux côtés fusionnent la version de l'autre. */
function both(a: Session, b: Session) {
  const left = structuredClone(a), right = structuredClone(b);
  mergeSession(left, b);
  mergeSession(right, a);
  return [left, right] as const;
}

describe('fusion de deux copies d’une revue', () => {
  it('réunit les points ajoutés de chaque côté, numérotés pareil des deux côtés', () => {
    const a = session([screen('c1', 1, [point('p1', 2), point('a', 5)])], 5);
    const b = session([screen('c1', 1, [point('p1', 2), point('b', 4)])], 4);
    const [left, right] = both(a, b);
    expect(left.captures[0]!.annotations.map((x) => `${x.number}:${x.id}`)).toEqual(['1:p1', '2:b', '3:a']);
    expect(sessionContent(left)).toBe(sessionContent(right));
  });

  it('un point modifié des deux côtés garde la version la plus récente', () => {
    const a = session([screen('c1', 1, [{ ...point('p1', 2, 'ici'), updatedAt: at(9) }])]);
    const b = session([screen('c1', 1, [{ ...point('p1', 2, 'là-bas'), updatedAt: at(7) }])]);
    const [left, right] = both(a, b);
    expect(left.captures[0]!.annotations[0]!.text).toBe('ici');
    expect(sessionContent(left)).toBe(sessionContent(right));
  });

  it('une suppression gagne sur l’autre copie, écrans comme points', () => {
    const base = session([screen('c1', 1, [point('p1', 2), point('p2', 3)]), screen('c2', 4)]);
    const a = structuredClone(base);
    a.captures[0]!.annotations.splice(1, 1);
    a.captures.splice(1, 1);
    markDeleted(a, 'p2', 'c2');
    const b = structuredClone(base);
    b.captures[0]!.annotations[0]!.text = 'modifié ailleurs';
    const [left, right] = both(a, b);
    expect(left.captures.map((c) => c.id)).toEqual(['c1']);
    expect(left.captures[0]!.annotations.map((x) => x.id)).toEqual(['p1']);
    expect(sessionContent(left)).toBe(sessionContent(right));
  });

  it('les écrans ajoutés des deux côtés suivent l’ordre de création ; fusionner deux fois ne change rien', () => {
    const a = session([screen('c1', 1), screen('c3', 6)]);
    const b = session([screen('c1', 1), screen('c2', 3)]);
    const [left] = both(a, b);
    expect(left.captures.map((c) => c.id)).toEqual(['c1', 'c2', 'c3']);
    const again = structuredClone(left);
    mergeSession(again, b);
    expect(sessionContent(again)).toBe(sessionContent(left));
  });

  it('la version reçue n’est jamais partagée entre la revue et son historique', () => {
    const received = session([screen('c1', 1, [point('p1', 2)])], 3);
    const live = session([], 1), snapshot = session([], 1);
    mergeSession(live, received);
    mergeSession(snapshot, received);
    live.captures[0]!.annotations[0]!.text = 'tapé ensuite';
    expect(snapshot.captures[0]!.annotations[0]!.text).toBe('p1');
    expect(received.captures[0]!.annotations[0]!.text).toBe('p1');
  });
});
