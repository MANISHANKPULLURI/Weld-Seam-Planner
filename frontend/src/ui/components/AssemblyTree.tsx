import { useState } from "react";
import { useStore } from "../../state/store";

export function AssemblyTree() {
  const components = useStore((s) => s.components);
  const selectedId = useStore((s) => s.selectedComponentId);
  const isolatedId = useStore((s) => s.isolatedComponentId);
  const selectComponent = useStore((s) => s.selectComponent);
  const renameComponent = useStore((s) => s.renameComponent);
  const toggleVisibility = useStore((s) => s.toggleVisibility);
  const isolateComponent = useStore((s) => s.isolateComponent);
  const toggleLock = useStore((s) => s.toggleLock);
  const removeComponent = useStore((s) => s.removeComponent);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [confirmId, setConfirmId] = useState<string | null>(null);

  if (components.length === 0) return <div className="component-empty">No components yet. Upload STL files.</div>;

  return (
    <div className="assembly-tree">
      <div className="assembly-tree-header">
        <span className="assembly-tree-title">Assembly Hierarchy</span>
        <span className="assembly-tree-count">{components.length} components</span>
      </div>
      <div className="assembly-tree-list">
        {components.map((c) => {
          const isSelected = c.id === selectedId;
          const isIsolated = c.id === isolatedId;
          return (
            <div key={c.id} className={`assembly-row${isSelected ? " assembly-selected" : ""}${c.locked ? " assembly-locked" : ""}`} onClick={() => selectComponent(c.id)} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter") selectComponent(c.id); }}>
              <div className="assembly-main">
                {editingId === c.id ? (
                  <input
                    className="assembly-rename-input"
                    value={editName}
                    autoFocus
                    onChange={(e) => setEditName(e.target.value)}
                    onBlur={() => { if (editName.trim()) renameComponent(c.id, editName.trim()); setEditingId(null); }}
                    onKeyDown={(e) => { if (e.key === "Enter") { if (editName.trim()) renameComponent(c.id, editName.trim()); setEditingId(null); } if (e.key === "Escape") setEditingId(null); }}
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <span className="assembly-name" title={c.originalFilename}>{c.name}</span>
                )}
                <span className="assembly-meta numeric">{c.triangleCount} tris · {c.material} {c.materialGrade}</span>
              </div>
              <div className="assembly-actions" onClick={(e) => e.stopPropagation()}>
                <button type="button" className={`icon-btn${!c.visible ? " icon-btn-off" : ""}`} title={c.visible ? "Hide" : "Show"} aria-label={c.visible ? "Hide" : "Show"} onClick={() => toggleVisibility(c.id)}>{c.visible ? "◉" : "○"}</button>
                <button type="button" className={`icon-btn${isIsolated ? " icon-btn-active" : ""}`} title="Isolate" aria-label="Isolate" onClick={() => isolateComponent(isIsolated ? null : c.id)}>{isIsolated ? "◎" : "◈"}</button>
                <button type="button" className={`icon-btn${c.locked ? " icon-btn-active" : ""}`} title={c.locked ? "Unlock" : "Lock"} aria-label={c.locked ? "Unlock" : "Lock"} onClick={() => toggleLock(c.id)}>{c.locked ? "🔒" : "🔓"}</button>
                <button type="button" className="icon-btn" title="Rename" aria-label="Rename" onClick={() => { setEditingId(c.id); setEditName(c.name); }}>✎</button>
                <button type="button" className="icon-btn icon-btn-danger" title="Remove" aria-label="Remove" onClick={() => setConfirmId(c.id)}>✕</button>
              </div>
              {confirmId === c.id && (
                <div className="assembly-confirm" onClick={(e) => e.stopPropagation()}>
                  <span>Remove {c.name}?</span>
                  <button type="button" className="btn-danger-sm" onClick={() => { removeComponent(c.id); if (selectedId === c.id) selectComponent(null); setConfirmId(null); }}>Confirm</button>
                  <button type="button" className="btn-ghost-sm" onClick={() => setConfirmId(null)}>Cancel</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {isolatedId && (
        <button type="button" className="btn-ghost" style={{ marginTop: 8, width: "100%" }} onClick={() => isolateComponent(null)}>Clear isolation</button>
      )}
    </div>
  );
}
