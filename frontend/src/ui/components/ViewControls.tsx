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
  const xray = useStore((s) => s.xray);
  const setXray = useStore((s) => s.setXray);
  const section = useStore((s) => s.section);
  const setSection = useStore((s) => s.setSection);

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
          <button type="button" aria-pressed={viewMode === "solid"} onClick={() => mode("solid")} title="Solid, smooth shaded"><LayersIcon size={12} /> Solid</button>
          <button type="button" aria-pressed={viewMode === "wireframe"} onClick={() => mode("wireframe")} title="Wireframe, all mesh edges"><GridIcon size={12} /> Wireframe</button>
          <button type="button" aria-pressed={viewMode === "triangles"} onClick={() => mode("triangles")} title="Feature edges over the solid part"><TriangleIcon size={12} /> Triangles</button>
        </div>
        <button type="button" className="view-btn" onClick={fit} aria-label="Fit model to view" title="Fit model (F)">
          <FitIcon size={12} /> Fit Model
        </button>
        <button type="button" className="view-btn" onClick={reset} aria-label="Reset view" title="Reset / Frame (R)">
          <RefreshIcon size={12} /> Reset View
        </button>
        <button type="button" className="view-btn" aria-pressed={xray} onClick={() => setXray(!xray)} title="See through the part to find seams inside it">
          X-ray
        </button>
        <div className="view-segmented" role="group" aria-label="Section view">
          {(["off", "x", "y", "z"] as const).map((axis) => (
            <button key={axis} type="button" aria-pressed={axis === "off" ? !section : section?.axis === axis} onClick={() => setSection(axis === "off" ? null : { axis, offset: section?.offset ?? 0.5 })} title={axis === "off" ? "No section" : `Cut across ${axis.toUpperCase()}`}>
              {axis === "off" ? "Section" : axis.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
      {section && (
        <label className="view-controls view-section-slider">
          <span>Cut at</span>
          <input type="range" min={0} max={1} step={0.01} value={section.offset} onChange={(e) => setSection({ axis: section.axis, offset: Number(e.target.value) })} aria-label={`Section position along ${section.axis.toUpperCase()}`} />
          <span className="numeric">{Math.round(section.offset * 100)}%</span>
        </label>
      )}

      {}
      <div className="view-controls view-controls-bottom-right" role="group" aria-label="Standard views, Z up">
        {(["iso", "top", "bottom", "front", "back", "left", "right"] as ViewId[]).map((id) => (
          <button
            key={id}
            type="button"
            className={`view-btn view-btn-compact${view === id ? " view-btn-active" : ""}`}
            onClick={() => v(id)}
            aria-label={`View ${id}`}
            aria-pressed={view === id}
            title={`${id.charAt(0).toUpperCase()+id.slice(1)} view, Z up`}
          >
            {id === "iso" ? <CubeIcon size={12} /> : null} {id === "iso" ? "Iso" : id.charAt(0).toUpperCase()+id.slice(1)}
          </button>
        ))}
      </div>
    </>
  );
}
