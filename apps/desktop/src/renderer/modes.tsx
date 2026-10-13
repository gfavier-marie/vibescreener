// Les quatre modes, dans l'ordre et sous les noms du site : capture d'écran, vidéo, documents, parcours.
// Partagés par l'éditeur vide, les vignettes, les menus et l'accueil ; chacun a sa couleur (.mode-<id>, theme.css).

import * as I from './icons.tsx';

export type ModeId = 'capture' | 'video' | 'documents' | 'tour';

export const MODES: ModeId[] = ['capture', 'video', 'documents', 'tour'];

/** L'action du menu qui lance chaque mode. */
export const MODE_ACTION = { capture: 'capture', video: 'video', documents: 'open-document', tour: 'tour' } as const;

/** Icône du mode dans sa pastille de couleur. */
export function ModeTile({ id, size = 16 }: { id: ModeId; size?: number }) {
  const Icon = { capture: I.Capture, video: I.Video, documents: I.Doc, tour: I.Tour }[id];
  return (
    <span className={`mode-tile mode-${id}`}>
      <Icon size={size} />
    </span>
  );
}
