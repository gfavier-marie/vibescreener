// Projet partagé, par fichier .vibescreener ou par lien de lecture : index, adresses et limites.
// Le lien porte la clé dans son fragment (#s=…&k=…), jamais envoyé au serveur : le relais ne garde que du chiffré.

import type { Project } from './model.ts';

export const SHARE_FORMAT = 1;
export const SHARE_EXT = 'vibescreener';
/** Un lien vit 30 jours après son dernier envoi. */
export const SHARE_DAYS = 30;
/** Revue chiffrée la plus lourde que le relais accepte (une requête de Worker plafonne à 100 Mo). */
export const MAX_SHARE_BYTES = 90 * 1024 * 1024;
/** Id d'un lien (tiré au hasard) et nom d'un objet du lien (« index » ou id d'une revue). */
export const SHARE_ID = /^[A-Za-z0-9_-]{16,64}$/;
export const SHARE_NAME = /^[A-Za-z0-9_-]{1,64}$/;

/** Revue décrite par l'index : liste de la visionneuse, et revues à importer. */
export type SharedSession = { id: string; name: string; points: number; screens: number; updatedAt: string };

/** Index d'un projet partagé : vibescreener.json du fichier, objet « index » du lien. */
export type ShareIndex = { app: 'vibescreener'; format: number; project: Project; sessions: SharedSession[]; sharedAt: string };

export function shareUrl(relay: string, id: string, key: string): string {
  return `${relay.replace(/\/$/, '')}/view#s=${id}&k=${key}`;
}

/** Lien collé : son relais, l'id et la clé ; null si ce n'est pas un lien de partage. */
export function parseShareUrl(text: string): { relay: string; id: string; key: string } | null {
  try {
    const url = new URL(text.trim());
    const hash = new URLSearchParams(url.hash.slice(1));
    const id = hash.get('s'), key = hash.get('k');
    if (!/^https?:$/.test(url.protocol) || !id || !key || !SHARE_ID.test(id)) return null;
    return { relay: url.origin + url.pathname.replace(/\/view\/?$/, '').replace(/\/$/, ''), id, key };
  } catch {
    return null;
  }
}

export const shareObjectUrl = (relay: string, id: string, name: string) => `${relay}/share/${id}/${name}`;
