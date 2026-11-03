import { useStore } from "../../state/store";
import type { ViewId } from "../../state/store";
import { GridIcon, RefreshIcon, CubeIcon, FitIcon, TriangleIcon, LayersIcon } from "../icons";

export function ViewControls({ controller }: { controller: import("../../viewer/SceneController").SceneController | null }) {
  const projection = useStore((s) => s.projection);
  const viewMode = useStore((s) => s.viewMode);
  const view = useStore((s) => s.view);
  const setProjection = useStore((s) => s.setProjection);
  const setViewMode = useStore((s) => s.setViewMode);
  const setView = useStore((s) => s.setView);

  function proj(p: "perspective" | "orthographic") {
    setProjection(p);
    controller?.setProjection(p);
  }
  function mode(m: "solid" | "wireframe" | "triangles") {
    setViewMode(m);
    controller?.setViewMode(m);
  }
  function reset() {
    controller?.resetView();
  }
  function fit() {
    controller?.fitModel(true);
  }
  function v(id: ViewId) {
    setView(id);
    controller?.setView(id);
  }

  return (
    <>
      {}
      <div className="view-controls view-controls-top view-controls-top-right" role="toolbar" aria-label="View settings">
        <div className="view-segmented" role="group" aria-label="Projection">
          <button type="button" aria-pressed={projection === "perspective"} onClick={() => proj("perspective")} title="Perspective projection (FOV 45°)">Perspective</button>
          <button type="button" aria-pressed={projection === "orthographic"} onClick={() => proj("orthographic")} title="Orthographic projection (no perspective)">Orthographic</button>
        </div>
        <div className="view-segmented" role="group" aria-label="Rendering mode">
          <button type="button" aria-pressed={viewMode === "solid"} onClick={() => mode("solid")} title="Solid — smooth shaded"><LayersIcon size={12} /> Solid</button>
          <button type="button" aria-pressed={viewMode === "wireframe"} onClick={() => mode("wireframe")} title="Wireframe — mesh edges"><GridIcon size={12} /> Wireframe</button>
          <button type="button" aria-pressed={viewMode === "triangles"} onClick={() => mode("triangles")} title="Triangle visualization — display tessellation"><TriangleIcon size={12} /> Triangles</button>
        </div>
        <button type="button" className="view-btn" onClick={fit} aria-label="Fit model to view" title="Fit model (F)">
          <FitIcon size={12} /> Fit Model
        </button>
        <button type="button" className="view-btn" onClick={reset} aria-label="Reset view" title="Reset / Frame (R)">
          <RefreshIcon size={12} /> Reset View
        </button>
      </div>

      {}
      <div className="view-controls view-controls-bottom-right" role="group" aria-label="Standard views — Z up">
        {(["iso", "top", "bottom", "front", "back", "left", "right"] as ViewId[]).map((id) => (
          <button
            key={id}
            type="button"
            className={`view-btn view-btn-compact${view === id ? " view-btn-active" : ""}`}
            onClick={() => v(id)}
            aria-label={`View ${id}`}
            aria-pressed={view === id}
            title={`${id.charAt(0).toUpperCase()+id.slice(1)} view — Z up`}
          >
            {id === "iso" ? <CubeIcon size={12} /> : null} {id === "iso" ? "Iso" : id.charAt(0).toUpperCase()+id.slice(1)}
          </button>
        ))}
      </div>
    </>
  );
}
