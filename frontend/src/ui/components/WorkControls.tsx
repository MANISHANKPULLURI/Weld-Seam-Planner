import { useEffect, useRef, useState } from "react";
import { useStore } from "../../state/store";
import { SaveIcon, RefreshIcon, TrashIcon } from "../icons";

/**
 * format a timestamp as hours and minutes
 */
const time = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

/**
 * checkpoint, restore and show save state
 */
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
    <div className="edge-toolbar" ref={menuRef}>
      <div className="edge-bar view-segmented" role="toolbar" aria-label="Checkpoints">
        <button type="button" aria-label="Save checkpoint" onClick={(e) => { saveCheckpoint(); setJustSaved(true); e.currentTarget.blur(); }} title={justSaved ? "Saved ✓" : checkpoint ? `Save checkpoint (last saved ${time(checkpoint.savedAt)})` : "Save checkpoint — snapshot current work so you can come back to it"}>
          <SaveIcon size={13} />
        </button>
        <button type="button" aria-label="Reset options" aria-haspopup="menu" aria-expanded={open} onClick={(e) => { setOpen((v) => !v); e.currentTarget.blur(); }} title="Reset — back to last checkpoint or start over with this part">
          <RefreshIcon size={13} />
        </button>
        <button type="button" className="edge-btn-danger" aria-label="Erase part" onClick={(e) => { e.currentTarget.blur(); useStore.getState().setConfirm({ title: "Erase part?", message: "Clear the part and all its seams? This cannot be undone.", confirmLabel: "Erase", danger: true, action: () => { const s = useStore.getState(); s.setPendingImport(null); s.loadAnother(); } }); }} title="Erase the loaded part and all its seams">
          <TrashIcon size={13} />
        </button>
      </div>
        {open && (
          <div className="work-menu edge-menu" role="menu">
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

/**
 * show whether the work is saved yet
 */
export function SaveStatusLine() {
  const ready = useStore((s) => s.initial !== null && (s.phase === "checked" || s.phase === "error"));
  const saveStatus = useStore((s) => s.saveStatus);
  const savedAt = useStore((s) => s.savedAt);
  if (!ready) return null;
  return (
    <span className={`save-status save-status-float save-${saveStatus}`} role="status" title="Your work is saved in this browser automatically">
      {saveStatus === "saving" ? "Saving…" : saveStatus === "error" ? "Not saved" : savedAt ? `Saved ${time(savedAt)}` : ""}
    </span>
  );
}
