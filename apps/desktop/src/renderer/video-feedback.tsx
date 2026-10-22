// Même pastille et même onde que dans l'éditeur, superposées à l'app qu'on commente.
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { createRoot } from 'react-dom/client';
import { drawAnnotations, type Annotation, type Ctx2D } from '@pastille/shared';
import type { VideoFeedback } from '../ipc.ts';
import { Wave, WAVE_BARS, clock } from './dictation-feedback.tsx';
import { T } from './texts.ts';
import * as I from './icons.tsx';

// Place du bandeau déplacé : centre et bas, en 0–1 de l'écran ; la même pour tous les écrans et les vidéos suivantes.
type BarPosition = { x: number; y: number };
const POSITION_KEY = 'video-bar-position';
function readPosition(): BarPosition | null {
  try {
    const p = JSON.parse(localStorage.getItem(POSITION_KEY) ?? 'null') as BarPosition | null;
    return p && typeof p.x === 'number' && typeof p.y === 'number' ? p : null;
  } catch {
    return null;
  }
}
const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), Math.max(min, max));

function App() {
  const [state, setState] = useState<VideoFeedback>(null);
  const [position, setPosition] = useState(readPosition);
  useEffect(() => {
    const sync = (e: StorageEvent) => { if (e.key === POSITION_KEY) setPosition(readPosition()); }; // déplacé sur un autre écran
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);
  /** On saisit le bandeau par son en-tête (hors boutons) pour le déplacer. */
  function drag(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.button !== 0 || (e.target as HTMLElement).closest('button')) return;
    const head = e.currentTarget;
    const box = head.parentElement!.getBoundingClientRect();
    const start = { x: e.clientX, y: e.clientY, center: box.left + box.width / 2, bottom: box.bottom };
    let moved: BarPosition | null = null;
    head.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const w = window.innerWidth, h = window.innerHeight;
      const center = clamp(start.center + ev.clientX - start.x, box.width / 2, w - box.width / 2);
      const bottom = clamp(start.bottom + ev.clientY - start.y, box.height, h);
      setPosition(moved = { x: center / w, y: bottom / h });
    };
    const end = () => {
      head.removeEventListener('pointermove', move);
      head.removeEventListener('pointerup', end);
      head.removeEventListener('pointercancel', end);
      if (!moved) return;
      try { localStorage.setItem(POSITION_KEY, JSON.stringify(moved)); } catch {} // pas gardée : elle revient en bas au prochain lancement
    };
    head.addEventListener('pointermove', move);
    head.addEventListener('pointerup', end);
    head.addEventListener('pointercancel', end);
  }
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const levels = useRef<number[]>([]);
  const lastClick = useRef<VideoFeedback>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const written = useRef(true); // le commentaire écrit n'est envoyé qu'une fois (Entrée, Échap ou champ quitté)
  // Écriture ouverte : le texte suit chaque frappe dans le processus principal, qui la termine aussi lui-même
  // (⌘ + clic, clic ou défilement ailleurs) ; le champ se vide alors ici.
  useEffect(() => {
    const field = fieldRef.current;
    if (state?.writing) {
      written.current = false;
      field?.focus();
      if (field) window.pastille.videoDraft(field.value);
    } else if (!written.current) {
      written.current = true;
      if (field) field.value = '';
    }
  }, [state?.writing]);
  // Point posé : le champ est prêt, la fenêtre prend le clavier (video-feedback.ts) ; la première lettre lance l'écriture.
  const clickAt = state?.click?.at;
  useEffect(() => {
    if (!clickAt || !fieldRef.current) return;
    fieldRef.current.value = '';
    fieldRef.current.focus();
  }, [clickAt]);
  function finishWriting(text: string | null) {
    if (written.current) return;
    written.current = true;
    if (fieldRef.current) fieldRef.current.value = '';
    void window.pastille.videoText(text);
  }
  const geometry = state?.click?.geometry;
  async function act(action: Parameters<typeof window.pastille.videoAction>[0]) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try { await window.pastille.videoAction(action); }
    catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    finally { setBusy(false); }
  }

  // La molette ne doit rien déplacer ici (voir overscroll-behavior dans la page).
  useEffect(() => {
    const block = (e: WheelEvent) => e.preventDefault();
    window.addEventListener('wheel', block, { passive: false });
    return () => window.removeEventListener('wheel', block);
  }, []);

  // Sans micro (clavier seul), l'état n'arrive plus dix fois par seconde : la durée avance ici.
  const receivedAt = useRef(0);
  const [, tick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => window.pastille.onVideoFeedback((next) => {
    receivedAt.current = Date.now();
    const previous = lastClick.current?.click;
    if (!next || previous?.at !== next.click?.at) { levels.current = []; setError(null); }
    if (next && !next.typing) levels.current = [...levels.current, next.level].slice(-WAVE_BARS);
    lastClick.current = next;
    setState(next);
    if (!next) window.pastille.videoFeedbackHover(false);
  }), []);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const draw = () => {
      const w = window.innerWidth, h = window.innerHeight;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      const ctx = canvas.getContext('2d')!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const c = state?.click;
      if (!c) return;
      // La pointe reste sur le pixel cliqué ; rayon identique au mode capture d'écran.
      const a: Annotation = {
        id: 'video-point', number: c.number, geometry: c.geometry ?? { kind: 'point', x: c.x / w, y: c.y / h },
        text: '', input: 'dictated', transcription: 'none', sketches: [], createdAt: '', updatedAt: '',
      };
      drawAnnotations(ctx as unknown as Ctx2D, [a], { x: 0, y: 0, width: w, height: h }, { radius: 13, selectedId: a.id });
    };
    draw();
    window.addEventListener('resize', draw);
    return () => window.removeEventListener('resize', draw);
  }, [state?.click?.x, state?.click?.y, state?.click?.number, geometry]);

  const v = T.videoFeedback;
  const c = state?.click;
  // Pastille réduite : en-tête seul, puis le champ quand un point est posé ; aides et touches masquées.
  const compact = !!state?.compact && !state.inspiration;
  const status = state?.typing
    ? (c ? (state.kept ? '' : v.typeToKeep) : v.keyboardOnly)
    : (state?.voiced ? T.editor.recording : c ? (state?.kept ? '' : v.speak) : v.microphone);
  return <>
    <canvas ref={canvasRef} aria-hidden="true" />
    {state && <div className={`feedback${state.armed ? ' armed' : ''}${compact ? ' compact' : ''}`}
      style={position ? { left: `${position.x * 100}%`, bottom: `${(1 - position.y) * 100}%` } : undefined} onMouseEnter={() => window.pastille.videoFeedbackHover(true)} onMouseLeave={() => window.pastille.videoFeedbackHover(false)}>
      <div className="feedback-head" title={v.move} onPointerDown={drag}>
        <span className="rec-dot" />
        <strong>{state.inspiration ? v.chooseInspiration : c ? v.point(c.number) : v.general}</strong>
        {!state.inspiration && <>
          {state.typing ? <span className="spacer" /> : <Wave levels={levels.current} />}
          <time>{clock(state.elapsedMs + Date.now() - receivedAt.current)}</time>
          {!state.typingFixed && <button type="button" className="toggle" aria-pressed={!!state.typing} disabled={busy || state.writing}
            title={state.typing ? v.useMicrophone : v.useKeyboard} onClick={() => void act('typing')}>
            <I.Keyboard size={13} /><span className="label">{v.keyboard}</span>
          </button>}
          <button type="button" className="toggle" title={compact ? v.expand : v.reduce} onClick={() => void window.pastille.videoAction('compact')}>
            <I.ChevronDown size={13} className={compact ? 'up' : undefined} />
          </button>
        </>}
        <button type="button" className="stop" title={`${v.stop}${state.stopShortcut ? ` (${state.stopShortcut})` : ''}`} onClick={() => void window.pastille.videoAction('stop')}>
          <I.Stop size={13} /><span className="label">{v.stop}</span>{state.stopShortcut && <kbd>{state.stopShortcut}</kbd>}
        </button>
      </div>
      {state.inspiration ? <>
        <div className="feedback-hint">{state.inspiration.number ? `${v.point(state.inspiration.number)} · ` : ''}{v.inspirationHint(state.inspiration.shortcut)}</div>
        <div className="feedback-tools">
          <button type="button" className="primary" disabled={busy} onClick={() => void act('capture-inspiration')}><I.Capture size={13} />{v.captureInspiration}</button>
          <button type="button" disabled={busy} onClick={() => void act('cancel-inspiration')}>{v.resume}</button>
        </div>
      </> : <>
        {!state.writing && !compact && <div className="feedback-meta" role="status">{status}</div>}
        {/* Champ toujours là (réduit : seulement avec un point), comme la bulle du mode capture. Sans point, la fenêtre
            ne prend pas le clavier (l'app relue le garde) : un clic dans le champ le demande, puis on tape.
            Après un point, on tape directement. */}
        {(!compact || c || state.writing) && <textarea ref={fieldRef} className={`feedback-text${state.writing ? ' writing' : ''}`} rows={state.writing ? 2 : 1}
          readOnly={!state.writing && !c} placeholder={v.writePlaceholder}
          onMouseDown={(e) => { if (!state.writing) { e.preventDefault(); void act('write'); } }}
          onInput={(e) => { if (state.writing) window.pastille.videoDraft(e.currentTarget.value); else void act('write'); }}
          onKeyDown={(e) => {
            if (!state.writing) { if (e.key === 'Enter') e.preventDefault(); return; } // écriture pas encore ouverte
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); finishWriting(e.currentTarget.value); }
            else if (e.key === 'Escape') finishWriting(null);
          }}
          onBlur={(e) => { if (state.writing) finishWriting(e.currentTarget.value); }} />}
        {state.writing ? <div className="feedback-hint">{v.writeHint}</div> : <>
          {c && <div className="feedback-tools">
            <button type="button" disabled={busy} title={state.tablet ? v.drawingReady : T.menu.pair} onClick={() => void act('draw')}><I.Tablet size={13} /><span className="label">{v.drawing}</span></button>
            <button type="button" disabled={busy} title={T.editor.inspiration} onClick={() => void act('inspiration')}><I.Picture size={13} /><span className="label">{T.editor.inspiration}</span></button>
          </div>}
          {!compact && <>
            <div className="feedback-keys">
              <span><kbd className="point-key">{v.key}</kbd> + <kbd>{v.click}</kbd> → {v.placePoint}</span>
              <span className="sep">·</span>
              <span><kbd>{v.click}</kbd> → {v.navigate}</span>
            </div>
            <div className="feedback-hint">{v.gestures}</div>
          </>}
        </>}
      </>}
      {(state.error || error) && <div className="feedback-error" role="alert">{state.error || error}</div>}
    </div>}
  </>;
}

createRoot(document.getElementById('root')!).render(<App />);
