import { useEffect, useRef, useState } from "react";
import { useStore } from "../../state/store";
import { MAX_PROJECTS, createProject, currentProjectId, deleteProject, listProjects, openProjectSnapshot, saveProjectSnapshot, setOpenProject } from "../../lib/persist";
import type { ProjectMeta } from "../../lib/persist";

const projectLabel = (p: ProjectMeta) => p.name || p.fileName?.replace(/\.stl$/i, "") || "Untitled project";

/**
 * switch between up to 5 saved projects from the top bar; the open one autosaves into its own slot
 */
export function ProjectSwitcher() {
  const [projects, setProjects] = useState<ProjectMeta[]>([]);
  const [current, setCurrent] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const refresh = async () => {
    setProjects(await listProjects());
    setCurrent(currentProjectId());
  };

  useEffect(() => { void refresh(); }, []);
  useEffect(() => { if (open) void refresh(); }, [open ]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const keys = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", keys);
    return () => { window.removeEventListener("mousedown", close); window.removeEventListener("keydown", keys); };
  }, [open ]);

  const switchTo = async (id: string) => {
    if (busy || id === currentProjectId()) { setOpen(false); return; }
    setBusy(true);
    try {
      const s = useStore.getState();
      const from = currentProjectId();
      if (from && s.phase !== "empty") await saveProjectSnapshot(from);
      const ok = await openProjectSnapshot(id);
      setCurrent(id);
      setOpen(false);
      if (!ok) {
        s.loadAnother();
        setNotice("That project slot is empty — started blank instead.");
      } else {
        setNotice(null);
      }
    } finally {
      setBusy(false);
      void refresh();
    }
  };

  const newProject = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const s = useStore.getState();
      const from = currentProjectId();
      if (from && s.phase !== "empty") await saveProjectSnapshot(from);
      const id = await createProject();
      if (!id) {
        setNotice(`Maximum ${MAX_PROJECTS} projects — delete one to add another.`);
        return;
      }
      setOpenProject(id);
      s.loadAnother();
      s.setPendingImport(null);
      setCurrent(id);
      setOpen(false);
      setNotice(null);
    } finally {
      setBusy(false);
      void refresh();
    }
  };

  const remove = (id: string) => {
    const target = projects.find((p) => p.id === id);
    const label = target ? projectLabel(target) : "this project";
    useStore.getState().setConfirm({
      title: "Delete project?",
      message: `Delete "${label}" and everything saved in it?`,
      confirmLabel: "Delete",
      danger: true,
      action: () => {
        void deleteProject(id).then(() => void refresh());
        if (id === currentProjectId()) {
          setOpenProject(null);
          useStore.getState().loadAnother();
          useStore.getState().setPendingImport(null);
          setCurrent(null);
        }
        setOpen(false);
      },
    });
  };

  const currentName = projects.find((p) => p.id === current)?.name ?? "Projects";

  return (
    <div className="menu-select project-switcher" ref={ref}>
      <button
        type="button"
        className="menu-select-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Switch project"
        title="Switch project (up to 5 saved)"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="project-switcher-name">{currentName}</span>
        <span className={`menu-select-chev${open ? " menu-select-chev-open" : ""}`} aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className="menu-select-list project-switcher-list" role="menu" aria-label="Projects">
          {projects.map((p) => (
            <div key={p.id} className={`menu-select-item project-row${p.id === current ? " menu-select-item-current" : ""}`}>
              <button type="button" className="project-row-main" role="menuitem" onClick={() => void switchTo(p.id)} title={p.fileName ? `${p.fileName} · saved ${new Date(p.savedAt).toLocaleString()}` : `Saved ${new Date(p.savedAt).toLocaleString()}`}>
                <span className="menu-select-check" aria-hidden="true">{p.id === current ? "✓" : ""}</span>
                <span className="project-row-text">
                  <span className="project-row-name">{projectLabel(p)}</span>
                  {p.fileName && <span className="project-row-sub numeric">{p.fileName}</span>}
                </span>
              </button>
              <button type="button" className="project-row-delete" aria-label={`Delete ${projectLabel(p)}`} title="Delete this project" onClick={() => void remove(p.id)}>✕</button>
            </div>
          ))}
          {projects.length === 0 && <p className="result-explainer">No saved projects yet.</p>}
          <button type="button" className="btn-secondary btn-block" disabled={busy || projects.length >= MAX_PROJECTS} onClick={() => void newProject()} title={projects.length >= MAX_PROJECTS ? `Maximum ${MAX_PROJECTS} projects` : "Save this one aside and start blank"}>
            + New project
          </button>
          {notice && <p className="result-explainer" role="status">{notice}</p>}
        </div>
      )}
    </div>
  );
}
