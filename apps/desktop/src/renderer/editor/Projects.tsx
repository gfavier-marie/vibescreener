// Projets, par-dessus l'éditeur : la liste des projets à gauche (nouveau, importer) ; à droite le projet
// choisi, son contexte, ses revues (ouvrir, exporter le PDF, ranger ailleurs, corbeille) et son partage :
// lien de lecture ou fichier projet.

import { useEffect, useRef, useState } from 'react';
import type { ProjectSummary, ShareLink } from '../../ipc.ts';
import * as I from '../icons.tsx';
import { T } from '../texts.ts';

const api = window.pastille;

export type Notice = { text: string; error?: boolean };

export const importNotice = (r: Awaited<ReturnType<typeof api.importProject>>): Notice | null =>
  r && (r.ok ? { text: T.projects.imported(r.report) } : { text: r.error, error: true });

export function ProjectsPanel(props: {
  projects: ProjectSummary[];
  initialId?: string;
  initialNotice?: Notice | null;
  sessionId?: string; // revue ouverte dans l'éditeur
  onOpen: (id: string) => void;
  onExport: (id: string) => void;
  onClose: () => void;
}) {
  const P = T.projects;
  const { projects } = props;
  const [selectedId, setSelectedId] = useState(props.initialId);
  const project = projects.find((p) => p.id === selectedId) ?? projects.find((p) => p.current) ?? projects[0];
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [importing, setImporting] = useState(false);
  const [linkText, setLinkText] = useState('');
  const [shareOpen, setShareOpen] = useState(false);
  const [link, setLink] = useState<ShareLink | undefined>();
  const [sending, setSending] = useState<{ done: number; total: number } | null>(null);
  const [notice, setNotice] = useState<Notice | null>(props.initialNotice ?? null);
  // Contexte en cours de saisie : enregistré à la sortie du champ, ou à la fermeture du panneau (clic à côté, Échap).
  const typedContext = useRef<{ id: string; text: string } | null>(null);
  const saveContext = () => {
    const typed = typedContext.current;
    typedContext.current = null;
    if (typed) void api.updateProject(typed.id, { context: typed.text });
  };
  useEffect(() => saveContext, []);

  useEffect(() => {
    setRenaming(false);
    setShareOpen(false);
    setLink(undefined);
    if (project) void api.shareLink(project.id).then(setLink);
  }, [project?.id]);
  useEffect(() => api.onShareProgress((p) => setSending(p && p.projectId === project?.id ? p : null)), [project?.id]);

  const show = (r: { ok: true } | { ok: false; error: string } | null, text?: string) => r && setNotice(r.ok ? (text ? { text } : null) : { text: r.error, error: true });

  async function create(name: string) {
    setCreating(false);
    if (name.trim()) setSelectedId(await api.createProject(name));
  }

  async function runImport(source?: string) {
    const r = await api.importProject(source);
    setNotice(importNotice(r));
    if (r?.ok) {
      setSelectedId(r.report.projectId);
      setImporting(false);
      setLinkText('');
    }
  }

  async function publish(id: string) {
    setNotice(null);
    const r = await api.publishLink(id);
    if (r.ok) setLink(r.link);
    show(r, P.copied);
  }

  async function revoke(id: string) {
    const r = await api.revokeLink(id);
    if (r.ok) setLink(undefined);
    show(r);
  }

  return (
    <div className="sessions-backdrop" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <section className="projects" role="dialog" aria-label={P.title}>
        <aside>
          <h2>{P.title}</h2>
          <ul>
            {projects.map((p) => (
              <li key={p.id}>
                <button type="button" className={`project ${p.id === project?.id ? 'selected' : ''}`} onClick={() => setSelectedId(p.id)}>
                  <span className="title">{p.name}</span>
                  <span className="meta">
                    {P.reviews(p.sessions.length)}
                    {p.current && ` · ${P.current}`}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {creating ? (
            <input
              className="field"
              autoFocus
              placeholder={P.namePlaceholder}
              aria-label={P.newProject}
              onBlur={(e) => void create(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur();
                if (e.key === 'Escape') {
                  e.stopPropagation();
                  setCreating(false);
                }
              }}
            />
          ) : (
            <button type="button" className="side-btn" onClick={() => setCreating(true)}>
              <I.Plus size={14} />
              {P.newProject}
            </button>
          )}
          <button type="button" className="side-btn" aria-expanded={importing} onClick={() => setImporting(!importing)}>
            <I.Download size={14} />
            {P.import}
          </button>
          {importing && (
            <div className="import">
              <p className="hint">{P.importHint}</p>
              <button type="button" className="btn" onClick={() => void runImport()}>
                {P.chooseFile}
              </button>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (linkText.trim()) void runImport(linkText.trim());
                }}
              >
                <input className="field" value={linkText} placeholder={P.linkPlaceholder} aria-label={P.linkPlaceholder} onChange={(e) => setLinkText(e.target.value)} />
                <button type="submit" className="btn" disabled={!linkText.trim()}>
                  {P.importLink}
                </button>
              </form>
            </div>
          )}
        </aside>

        {project && (
          <div className="project-pane">
            <div className="sessions-head">
              {renaming ? (
                <input
                  className="field name-field"
                  autoFocus
                  aria-label={P.rename}
                  defaultValue={project.name}
                  onBlur={(e) => {
                    void api.updateProject(project.id, { name: e.target.value });
                    setRenaming(false);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') e.currentTarget.blur();
                    if (e.key === 'Escape') {
                      e.stopPropagation();
                      setRenaming(false);
                    }
                  }}
                />
              ) : (
                <button type="button" className="name" aria-label={P.rename} onClick={() => setRenaming(true)}>
                  <span>{project.name}</span>
                  <I.Pencil size={13} />
                </button>
              )}
              <div className="head-tools">
                <button type="button" className="btn" aria-expanded={shareOpen} onClick={() => setShareOpen(!shareOpen)}>
                  <I.Share size={14} />
                  {P.share}
                </button>
                <button type="button" className="nav-btn" aria-label={P.trashProject} title={P.trashProject} onClick={() => void api.trashProject(project.id)}>
                  <I.Trash size={14} />
                </button>
                <button type="button" className="nav-btn" aria-label={T.editor.close} onClick={props.onClose}>
                  <I.Close size={11} />
                </button>
              </div>
            </div>

            {notice && <p className={`notice ${notice.error ? 'error' : ''}`}>{notice.text}</p>}

            {shareOpen && (
              <div className="share">
                <section>
                  <h3>{P.linkTitle}</h3>
                  <p className="hint">{P.linkHint}</p>
                  {link && (
                    <div className="link-row">
                      <input className="field" readOnly value={link.url} aria-label={P.linkTitle} onFocus={(e) => e.target.select()} />
                      <button type="button" className="btn" onClick={() => api.copyText(link.url)}>
                        {P.copyLink}
                      </button>
                    </div>
                  )}
                  <div className="link-row">
                    {sending ? (
                      <span className="meta">
                        <I.Spinner size={13} /> {P.sending(sending.done, sending.total)}
                      </span>
                    ) : (
                      <>
                        {link && <span className="meta">{P.linkState(link.sharedAt, link.expiresAt)}</span>}
                        <button type="button" className="btn primary" disabled={project.sessions.length === 0} onClick={() => void publish(project.id)}>
                          {link ? P.updateLink : P.createLink}
                        </button>
                        {link && (
                          <button type="button" className="btn danger" onClick={() => void revoke(project.id)}>
                            {P.stopLink}
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </section>
                <section>
                  <h3>{P.fileTitle}</h3>
                  <p className="hint">{P.fileHint}</p>
                  <div className="link-row">
                    <button type="button" className="btn" onClick={() => void api.saveProjectFile(project.id).then((r) => show(r))}>
                      {P.saveFile}
                    </button>
                  </div>
                </section>
              </div>
            )}

            <label className="context">
              <span className="label">{P.context}</span>
              <textarea
                key={project.id}
                rows={2}
                defaultValue={project.context ?? ''}
                placeholder={P.contextPlaceholder}
                onChange={(e) => (typedContext.current = { id: project.id, text: e.target.value })}
                onBlur={saveContext}
              />
              <small className="hint">{P.contextHint}</small>
            </label>

            <span className="label">{P.reviews(project.sessions.length)}</span>
            <ul>
              {project.sessions.length === 0 && <li className="none">{P.noReviews}</li>}
              {project.sessions.map((r) => (
                <li key={r.id} className={r.id === props.sessionId ? 'current' : ''}>
                  <button type="button" className="open" aria-label={P.openReview(r.name)} onClick={() => props.onOpen(r.id)}>
                    <span className="title">{r.name}</span>
                    <span className="meta">
                      {T.points(r.points)} · {T.screens(r.screens)} · {T.day(r.updatedAt)}
                    </span>
                  </button>
                  {r.id === props.sessionId && <span className="tag">{P.open}</span>}
                  <button
                    type="button"
                    className="tool"
                    aria-label={P.exportReview(r.name)}
                    title={P.exportReview(r.name)}
                    disabled={r.screens === 0}
                    onClick={() => props.onExport(r.id)}
                  >
                    <I.Export size={14} />
                  </button>
                  {projects.length > 1 && (
                    // Ranger dans un autre projet : liste native, sans autre panneau.
                    <label className="tool move" title={P.moveReview(r.name)}>
                      <I.Folder size={14} />
                      <select aria-label={P.moveReview(r.name)} value="" onChange={(e) => void api.moveSession(r.id, e.target.value)}>
                        <option value="" disabled>
                          {P.moveTo}
                        </option>
                        {projects
                          .filter((p) => p.id !== project.id)
                          .map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                      </select>
                    </label>
                  )}
                  <button type="button" className="tool" aria-label={P.trashReview(r.name)} title={P.trashReview(r.name)} onClick={() => void api.trashSession(r.id)}>
                    <I.Trash size={14} />
                  </button>
                </li>
              ))}
            </ul>
            <div className="foot">
              <button
                type="button"
                className="btn"
                onClick={() =>
                  void api.newReview(project.id).then(() => {
                    props.onClose();
                  })
                }
              >
                <I.Plus size={14} />
                {P.newReview}
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

