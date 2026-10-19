// Projet partagé, par fichier .vibescreener ou en ligne : index, adresses et limites. Les liens portent la clé
// dans leur fragment (#s=…&k=…, plus &t=… pour celui de collaboration), jamais envoyé au serveur : le relais ne
// garde que du chiffré.

import { toBase64Url } from './crypto.ts';
import type { Project } from './model.ts';

/** Projet en ligne : 1 (0.16) une revue = un zip ; 2 une revue = son session.json, chaque fichier à part. */
export const SHARE_FORMAT = 2;
export const SHARE_EXT = 'vibescreener';
/** Un partage vit 30 jours après sa dernière modification. */
export const SHARE_DAYS = 30;
/** Objet chiffré le plus lourd que le relais accepte, revue ou fichier (une requête de Worker plafonne à 100 Mo). */
export const MAX_SHARE_BYTES = 90 * 1024 * 1024;
/** Id d'un partage (tiré au hasard) et nom d'un objet (« index », id d'une revue, fichier). */
export const SHARE_ID = /^[A-Za-z0-9_-]{16,64}$/;
export const SHARE_NAME = /^[A-Za-z0-9_-]{1,64}$/;

/** Revue décrite par l'index : liste de la visionneuse, et revues à importer ; `etag` : version de son objet. */
export type SharedSession = { id: string; name: string; points: number; screens: number; updatedAt: string; etag?: string };

/**
 * Index d'un projet partagé : vibescreener.json du fichier, objet « index » en ligne. `deleted` : revues
 * retirées (corbeille, rangées ailleurs) et quand, pour que les autres copies les retirent aussi.
 */
export type ShareIndex = {
  app: 'vibescreener';
  format: number;
  project: Project;
  sessions: SharedSession[];
  deleted?: Record<string, string>;
  sharedAt: string; // dernière modification
};

/** Lien de lecture (navigateur) ; avec le jeton, lien de collaboration (dans l'app, pour modifier). */
export function shareUrl(relay: string, id: string, key: string, token?: string): string {
  return `${relay.replace(/\/$/, '')}/view#s=${id}&k=${key}${token ? `&t=${token}` : ''}`;
}

/** Lien collé : son relais, l'id, la clé et le jeton d'un lien de collaboration ; null si ce n'est pas un lien de partage. */
export function parseShareUrl(text: string): { relay: string; id: string; key: string; token?: string } | null {
  try {
    const url = new URL(text.trim());
    const hash = new URLSearchParams(url.hash.slice(1));
    const id = hash.get('s'), key = hash.get('k'), token = hash.get('t') ?? undefined;
    if (!/^https?:$/.test(url.protocol) || !id || !key || !SHARE_ID.test(id)) return null;
    return { relay: url.origin + url.pathname.replace(/\/view\/?$/, '').replace(/\/$/, ''), id, key, ...(token && { token }) };
  } catch {
    return null;
  }
}

/** Objet d'un fichier de revue en ligne (image, croquis, document) : son nom ne dit rien du fichier. */
export async function fileObjectName(sessionId: string, path: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${sessionId}/${path}`));
  return `f${toBase64Url(new Uint8Array(hash))}`;
}

export const shareObjectUrl = (relay: string, id: string, name: string) => `${relay}/share/${id}/${name}`;
