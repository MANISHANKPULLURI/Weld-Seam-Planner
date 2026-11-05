import { useStore } from "../../state/store";
import { focusForBody } from "../../lib/focus";
import { formatCount } from "../../domain/mesh/describe";
import { EyeIcon } from "../icons";

/**
 * list the separate bodies to show or hide
 */
export function BodiesCard() {
  const mesh = useStore((s) => s.mesh);
  const hidden = useStore((s) => s.hiddenBodies);
  const { toggleBody, isolateBody, showAllBodies } = useStore.getState();
  const count = mesh?.health.bodies ?? 0;

  if (!mesh || count < 2) return null;

  const triangles = new Array<number>(count).fill(0);
  for (const b of mesh.bodyOfTriangle) triangles[b]!++;

  return (
    <details className="disclosure result-card">
      <summary>Bodies <span className="numeric">{count}</span>{hidden.length > 0 && <span className="disclosure-meta">{hidden.length} hidden</span>}</summary>
      <ul className="body-rows">
        {triangles.map((n, i) => (
          <li key={i} className={`body-row${hidden.includes(i) ? " body-row-hidden" : ""}`}>
            <button type="button" className="icon-btn" onClick={() => toggleBody(i)} aria-label={hidden.includes(i) ? `Show body ${i + 1}` : `Hide body ${i + 1}`}><EyeIcon off={hidden.includes(i)} /></button>
            <span>Body {i + 1}</span>
            <span className="numeric body-row-meta">{formatCount(n)} triangles</span>
            <button type="button" className="btn-link" onClick={() => useStore.getState().setFocus(focusForBody(mesh, i))} title="Zoom to this part and fade the rest">Focus</button>
            <button type="button" className="btn-link" onClick={() => isolateBody(i)}>Isolate</button>
          </li>
        ))}
      </ul>
      {hidden.length > 0 && <button type="button" className="btn-link" onClick={showAllBodies}>Show all</button>}
    </details>
  );
}
