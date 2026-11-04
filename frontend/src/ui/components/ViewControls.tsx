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
        <button type="button" className="view-btn" aria-pressed={!!section} onClick={() => setSection(section ? null : { axis: "x", offset: 0.5, flipped: false })} title="Cut the part open to see inside">
          Section
        </button>
      </div>
      {section && <SectionPanel controller={controller} />}

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

function SectionPanel({ controller }: { controller: import("../../viewer/SceneController").SceneController | null }) {
  const section = useStore((s) => s.section)!;
  const workArea = useStore((s) => s.workArea);
  const { setSection, setWorkArea } = useStore.getState();
  const bounds = controller?.getBounds();
  const k = "xyz".indexOf(section.axis);
  const min = bounds ? bounds.min.getComponent(k) : 0;
  const size = bounds ? bounds.size.getComponent(k) : 1;
  const atMm = min + size * section.offset;
  const label = `${section.axis.toUpperCase()} ${section.flipped ? "above" : "below"} ${atMm.toFixed(1)} mm`;

  function confirm() {
    const plane = controller?.sectionInPartSpace();
    if (plane) setWorkArea({ plane, label });
  }

  if (workArea) {
    return (
      <div className="view-controls view-section-panel" role="group" aria-label="Work area">
        <span className="view-section-locked">Working only in <strong>{workArea.label}</strong></span>
        <button type="button" className="view-btn" onClick={() => setWorkArea(null)} title="Move the cut again">Change</button>
        <button type="button" className="view-btn" onClick={() => setSection(null)} title="Go back to working on the whole model">Whole model</button>
      </div>
    );
  }

  return (
    <div className="view-controls view-section-panel" role="group" aria-label="Section">
      <div className="view-segmented" role="group" aria-label="Cut across">
        {(["x", "y", "z"] as const).map((axis) => (
          <button key={axis} type="button" aria-pressed={section.axis === axis} onClick={() => setSection({ ...section, axis })} title={`Cut across ${axis.toUpperCase()}`}>{axis.toUpperCase()}</button>
        ))}
      </div>
      <input className="view-section-range" type="range" min={0} max={1} step={0.001} value={section.offset} onChange={(e) => setSection({ ...section, offset: Number(e.target.value) })} aria-label={`Section position along ${section.axis.toUpperCase()}`} />
      <label className="view-section-mm">
        <input className="field-control numeric" type="number" step={1} value={Number(atMm.toFixed(1))} onChange={(e) => setSection({ ...section, offset: Math.min(1, Math.max(0, (Number(e.target.value) - min) / (size || 1))) })} aria-label="Section position in millimetres" />
        mm
      </label>
      <button type="button" className="view-btn" onClick={() => setSection({ ...section, flipped: !section.flipped })} title="Keep the other side">Flip</button>
      <button type="button" className="btn-primary view-section-confirm" onClick={confirm} title="Detect, list, pick and draw only on the side you can see">Work here only</button>
      <button type="button" className="view-btn" onClick={() => setSection(null)} aria-label="Close section">Close</button>
    </div>
  );
}
