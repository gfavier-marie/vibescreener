// Visionneuse d'un projet partagé par lien (lecture seule) : l'index puis chaque revue, chiffrés, arrivent
// du relais et sont déchiffrés ici avec la clé du fragment (#s=…&k=…), que le serveur ne voit jamais.

import JSZip from 'jszip';
import {
  drawAnnotations,
  importKey,
  isSkippedPage,
  open,
  parseShareUrl,
  shareObjectUrl,
  upgradeSession,
  type Annotation,
  type Capture,
  type Session,
  type ShareIndex,
  type SharedSession,
} from '@pastille/shared';
import { lang, T } from './texts.ts';

const V = T.view;
const main = document.querySelector('#main') as HTMLElement;
(document.querySelector('#mode') as HTMLElement).textContent = V.readOnly;

const decoder = new TextDecoder();
const date = (iso: string) => new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso));

/** Élément avec son texte (jamais de HTML venu du projet). */
function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: { className?: string; text?: string } = {}, ...children: Node[]) {
  const node = document.createElement(tag);
  if (props.className) node.className = props.className;
  if (props.text !== undefined) node.textContent = props.text;
  node.append(...children);
  return node;
}

class ViewError extends Error {}

function status(text: string, error = false) {
  main.replaceChildren(el('p', { className: `status ${error ? 'error' : ''}`, text }));
}

const link = parseShareUrl(location.href);
let key: CryptoKey;
let index: ShareIndex;
const urls: string[] = []; // images de la revue affichée, libérées au changement

async function get(name: string): Promise<Uint8Array<ArrayBuffer>> {
  let res: Response;
  try {
    res = await fetch(shareObjectUrl(link!.relay, link!.id, name), { cache: 'no-store' });
  } catch {
    throw new ViewError(V.errors.network);
  }
  if (res.status === 404) throw new ViewError(V.errors.expired);
  if (!res.ok) throw new ViewError(V.errors.network);
  try {
    return await open(key, new Uint8Array(await res.arrayBuffer()));
  } catch {
    throw new ViewError(V.errors.key);
  }
}

function footer() {
  const copy = el('button', { text: V.copyLink });
  copy.addEventListener('click', () => void navigator.clipboard.writeText(location.href).then(() => (copy.textContent = V.copied)));
  return el('footer', {}, el('p', { text: V.importHint }), el('p', { text: V.secure }), copy);
}

function showProject() {
  const { project, sessions } = index;
  document.title = `${project.name} · VibeScreener`;
  const list = el('ul', { className: 'reviews' });
  for (const s of sessions) {
    const open = el(
      'button',
      {},
      el('span', { className: 'name', text: s.name }),
      el('span', { className: 'meta', text: `${V.counts(s.points, s.screens)} · ${date(s.updatedAt)}` }),
    );
    open.addEventListener('click', () => void showReview(s));
    list.append(el('li', {}, open));
  }
  main.replaceChildren(
    el('h1', { text: project.name }),
    ...(project.context ? [el('p', { className: 'context', text: project.context })] : []),
    el('p', { className: 'meta', text: `${V.reviews(sessions.length)} · ${V.sharedOn(date(index.sharedAt))}` }),
    sessions.length ? list : el('p', { className: 'status', text: V.noReviews }),
    footer(),
  );
  scrollTo(0, 0);
}

function screenTitle(n: number, c: Capture) {
  const doc = c.source?.document;
  if (doc) return [doc.name, doc.sheet ?? (doc.format === 'pptx' ? V.slide : V.page)(doc.page)].join(' — ');
  return [V.screen(n), c.source?.app, c.source?.windowTitle].filter(Boolean).join(' — ');
}

const blobUrl = (data: Uint8Array<ArrayBuffer>) => {
  const url = URL.createObjectURL(new Blob([data], { type: 'image/png' }));
  urls.push(url);
  return url;
};

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

/** Capture et ses pastilles sur une toile à la largeur affichée ; une très longue page reste sous les limites des toiles. */
async function drawScreen(canvas: HTMLCanvasElement, url: string, annotations: Annotation[]) {
  const img = await loadImage(url);
  const width = canvas.clientWidth || 800;
  const scale = Math.min(devicePixelRatio || 1, 2, 16_000 / ((width * img.height) / img.width));
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round((canvas.width * img.height) / img.width);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  drawAnnotations(ctx, annotations, { x: 0, y: 0, width: canvas.width, height: canvas.height }, { radius: Math.max(10 * scale, canvas.width / 90) });
}

function figure(url: string, caption: string) {
  const img = el('img');
  img.src = url;
  img.alt = caption;
  const a = el('a', {}, img);
  a.href = url;
  a.target = '_blank';
  return el('figure', {}, a, el('figcaption', { text: caption }));
}

async function showReview(summary: SharedSession) {
  status(V.loadingReview);
  try {
    const zip = await JSZip.loadAsync(await get(summary.id));
    const file = async (path: string) => {
      const entry = zip.file(path);
      return entry ? new Uint8Array(await entry.async('uint8array')) : undefined;
    };
    const session = upgradeSession(JSON.parse(decoder.decode((await file('session.json')) ?? new Uint8Array())) as Session);
    for (const url of urls.splice(0)) URL.revokeObjectURL(url);

    const back = el('button', { className: 'back', text: `← ${V.back}` });
    back.addEventListener('click', showProject);
    const points = session.captures.reduce((n, c) => n + c.annotations.length, 0);
    const parts: Node[] = [
      back,
      el('h2', { text: session.name }),
      el('p', { className: 'meta', text: `${index.project.name} · ${V.counts(points, session.captures.length)} · ${date(session.updatedAt)}` }),
    ];
    const notes = (session.notes ?? []).filter((n) => n.text.trim());
    if (notes.length) parts.push(el('h3', { className: 'notes-title', text: V.notes }), el('ul', { className: 'notes' }, ...notes.map((n) => el('li', { text: n.text.trim() }))));

    const screens: [HTMLCanvasElement, string, Annotation[]][] = [];
    for (const [i, c] of session.captures.entries()) {
      if (isSkippedPage(c)) continue; // page de document sans point, comme dans les exports
      const image = await file(c.image);
      if (!image) continue;
      const canvas = el('canvas');
      screens.push([canvas, blobUrl(image), c.annotations]);
      const list = el('ol', { className: 'points' });
      for (const a of c.annotations) {
        const extras = el('div', { className: 'extras' });
        for (const [k, sketch] of a.sketches.entries()) {
          const png = await file(sketch.png);
          if (png) extras.append(figure(blobUrl(png), `${V.sketch} ${k + 1}`));
        }
        for (const inspiration of a.inspirations ?? []) {
          const png = await file(inspiration.image);
          if (png) extras.append(figure(blobUrl(png), V.inspiration));
        }
        list.append(
          el(
            'li',
            {},
            el('span', { className: `pin ${a.geometry.kind === 'point' ? '' : 'round'}`, text: String(a.number) }),
            el('div', {}, el('p', { className: `comment ${a.text.trim() ? '' : 'empty'}`, text: a.text.trim() || T.noComment }), ...(extras.childElementCount ? [extras] : [])),
          ),
        );
      }
      parts.push(el('section', { className: 'screen' }, el('h3', { text: screenTitle(i + 1, c) }), canvas, list));
    }
    parts.push(footer());
    main.replaceChildren(...parts);
    scrollTo(0, 0);
    for (const [canvas, url, annotations] of screens) await drawScreen(canvas, url, annotations);
  } catch (err) {
    status(err instanceof ViewError ? err.message : V.errors.network, true);
  }
}

async function start() {
  if (!link) return status(V.errors.link, true);
  status(V.loading);
  try {
    key = await importKey(link.key);
  } catch {
    return status(V.errors.link, true);
  }
  try {
    index = JSON.parse(decoder.decode(await get('index'))) as ShareIndex;
    showProject();
  } catch (err) {
    status(err instanceof ViewError ? err.message : V.errors.network, true);
  }
}

// Autre lien collé dans le même onglet : seul le fragment change, la page repart de zéro.
addEventListener('hashchange', () => location.reload());
void start();
