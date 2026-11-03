import { useStore } from "../../state/store";
import type { ProjectComponent } from "../../state/store";
import { CheckIcon, AlertIcon, XIcon } from "../icons";

export function ComponentList({ components, onRemove, onRetry }: { components: ProjectComponent[]; onRemove: (id: string) => void; onRetry?: (id: string) => void }) {
  if (components.length === 0) return <div className="component-empty">No components yet. Upload STL files.</div>;
  return (
    <div className="component-list">
      {components.map((c) => (
        <div key={c.id} className={`component-row component-${c.status}`}>
          <div className="component-main">
            <div className="component-name" title={c.originalFilename}>{c.name}</div>
            <div className="component-meta">
              <span className="numeric">{c.triangleCount} tris</span> · <span className="numeric">{c.vertexCount} verts</span> · <span className="numeric">{c.bounds.size.x.toFixed(1)}×{c.bounds.size.y.toFixed(1)}×{c.bounds.size.z.toFixed(1)} {c.units}</span>
            </div>
            {c.status === "error" && <div className="component-error">{c.error}</div>}
            {c.status === "validated" && c.health && (
              <div className="component-health">
                {c.health.openEdges > 0 ? `${c.health.openEdges} open edges` : "Closed"} · {c.health.bodies} bodies
              </div>
            )}
          </div>
          <div className="component-actions">
            <span className={`component-status component-status-${c.status}`}>
              {c.status === "validated" ? <CheckIcon size={12} /> : c.status === "error" ? <AlertIcon size={12} /> : null} {c.status}
            </span>
            {c.status === "error" && onRetry && <button type="button" className="btn-ghost" style={{ height: 28 }} onClick={() => onRetry(c.id)}>Retry</button>}
            <button type="button" className="btn-ghost" style={{ height: 28 }} onClick={() => onRemove(c.id)} aria-label={`Remove ${c.name}`}><XIcon size={12} /></button>
          </div>
        </div>
      ))}
    </div>
  );
}
