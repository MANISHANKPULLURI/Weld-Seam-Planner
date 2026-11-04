import { useEffect, useRef, useState } from "react";
import { useStore } from "../../state/store";

const time = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

export function WorkControls() {
  const ready = useStore((s) => s.initial !== null && (s.phase === "checked" || s.phase === "error"));
  const checkpoint = useStore((s) => s.checkpoint);
  const saveStatus = useStore((s) => s.saveStatus);
  const savedAt = useStore((s) => s.savedAt);
  const { saveCheckpoint, restoreCheckpoint, resetToInitial } = useStore.getState();
  const [open, setOpen] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !menuRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", close);
    return () => { window.removeEventListener("mousedown", close); window.removeEventListener("keydown", close); };
  }, [open]);

  useEffect(() => {
    if (!justSaved) return;
    const t = setTimeout(() => setJustSaved(false), 2000);
    return () => clearTimeout(t);
  }, [justSaved]);

  if (!ready) return null;

  return (
    <div className="work-controls" ref={menuRef}>
      <span className={`save-status save-${saveStatus}`} role="status" title="Your work is saved in this browser automatically">
        {saveStatus === "saving" ? "Saving…" : saveStatus === "error" ? "Not saved" : savedAt ? `Saved ${time(savedAt)}` : ""}
      </span>
      <button type="button" className="planner-collapse-btn" onClick={() => { saveCheckpoint(); setJustSaved(true); }} title={checkpoint ? `Last saved at ${time(checkpoint.savedAt)}` : "Save the current work so you can come back to it"}>
        {justSaved ? "Saved" : "Save checkpoint"}
      </button>
      <button type="button" className="planner-collapse-btn" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>Reset</button>
      {open && (
        <div className="work-menu" role="menu">
          <button type="button" role="menuitem" className="work-menu-item" disabled={!checkpoint} onClick={() => { restoreCheckpoint(); setOpen(false); }}>
            <span className="work-menu-title">Back to last checkpoint</span>
            <span className="work-menu-desc">{checkpoint ? `Saved at ${time(checkpoint.savedAt)}. Work after that is discarded.` : "No checkpoint saved yet."}</span>
          </button>
          <button type="button" role="menuitem" className="work-menu-item" onClick={() => { resetToInitial(); setOpen(false); }}>
            <span className="work-menu-title">Start over with this part</span>
            <span className="work-menu-desc">Back to the part as first loaded. Seams, repair and units are cleared.</span>
          </button>
        </div>
      )}
    </div>
  );
}
