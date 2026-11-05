import { useState } from "react";
import { useStore } from "../../state/store";
import type { ViewId } from "../../state/store";
import { GridIcon, RefreshIcon, CubeIcon, FitIcon, TriangleIcon, LayersIcon, PanelLeftIcon } from "../icons";

/**
 * render camera, view-mode and section controls
 */
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
  const panelCollapsed = useStore((s) => s.panelCollapsed);
  const setPanelCollapsed = useStore((s) => s.setPanelCollapsed);

  /**
   * switch the camera projection
   */
  function proj(p: "perspective" | "orthographic") {
    setProjection(p);
    controller?.setProjection(p);
  }
  /**
   * switch the part render mode
   */
  function mode(m: "solid" | "wireframe" | "triangles") {
    setViewMode(m);
    controller?.setViewMode(m);
  }
  /**
   * reset the camera to the default view
   */
  function reset() {
    controller?.resetView();
  }
  /**
   * fit the part into view
   */
  function fit() {
    controller?.fitModel(true);
  }
  /**
   * fly the camera to a named view
   */
  function v(id: ViewId) {
    setView(id);
    controller?.setView(id);
  }

  return (
    <>
      {}
      <div className="view-controls view-controls-top-left" role="toolbar" aria-label="Camera">
        <button type="button" className="view-btn" onClick={() => setPanelCollapsed(!panelCollapsed)} aria-expanded={!panelCollapsed} aria-controls="planner-panel" aria-label={panelCollapsed ? "Open settings panel" : "Close settings panel"} title={panelCollapsed ? "Show panel" : "Hide panel (1-5 still switch steps)"}>
          <PanelLeftIcon size={12} />
        </button>
        <button type="button" className="view-btn" onClick={fit} aria-label="Fit model to view" title="Fit model (F)">
          <FitIcon size={12} /> Fit
        </button>
        <button type="button" className="view-btn" onClick={reset} aria-label="Reset view" title="Reset / Frame (R)">
          <RefreshIcon size={12} /> Reset
        </button>
      </div>
      <div className="view-controls view-controls-top view-controls-top-right" role="toolbar" aria-label="View settings">
        <div className="view-settings-col">
          <div className="view-settings-row">
            <div className="view-segmented" role="group" aria-label="Rendering mode">
              <button type="button" aria-pressed={viewMode === "solid"} onClick={() => mode("solid")} title="Solid, smooth shaded"><LayersIcon size={12} /> Solid</button>
              <button type="button" aria-pressed={viewMode === "wireframe"} onClick={() => mode("wireframe")} title="Wireframe, all mesh edges"><GridIcon size={12} /> Wire</button>
              <button type="button" aria-pressed={viewMode === "triangles"} onClick={() => mode("triangles")} title="Feature edges over the solid part (triangles mode)"><TriangleIcon size={12} /> Feature</button>
            </div>
            <div className="view-segmented" role="group" aria-label="Projection">
              <button type="button" aria-pressed={projection === "perspective"} onClick={() => proj("perspective")} title="Perspective projection (FOV 45°)">Persp</button>
              <button type="button" aria-pressed={projection === "orthographic"} onClick={() => proj("orthographic")} title="Orthographic projection (no perspective)">Ortho</button>
            </div>
          </div>
          <div className="view-settings-row view-settings-row-right">
            <button type="button" className="view-btn" aria-pressed={xray} onClick={() => setXray(!xray)} title="See through the part to find seams inside it (X)">
              X-ray
            </button>
            <button type="button" className="view-btn" aria-pressed={!!section} onClick={() => setSection(section ? null : { axis: "x", offset: 0.5, flipped: false })} title="Cut the part open to see inside">
              Section
            </button>
          </div>
        </div>
      </div>
      {section && <SectionPanel controller={controller} />}

      {}
      <div className="view-controls view-controls-bottom-right" role="group" aria-label="Standard views, Z up">
        <label className="view-select-wrap" title="Standard view, Z up">
          <span className="view-select-label"><CubeIcon size={12} /> View</span>
          <select
            className="view-select"
            value={view}
            onChange={(e) => v(e.target.value as ViewId)}
            aria-label="Standard view, Z up"
          >
            {(["iso", "top", "bottom", "front", "back", "left", "right"] as ViewId[]).map((id) => (
              <option key={id} value={id}>{id === "iso" ? "Iso" : id.charAt(0).toUpperCase() + id.slice(1)}</option>
            ))}
          </select>
        </label>
      </div>
    </>
  );
}

/**
 * position the section cut and confirm a work area
 */
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
  const [mmText, setMmText] = useState<string | null>(null);
  const [mmError, setMmError] = useState<string | null>(null);

  /**
   * move the section cut to a typed millimetre value
   */
  function commitMm(raw: string) {
    if (raw.trim() === "") { setMmError(null); return; }
    const n = Number(raw);
    if (!Number.isFinite(n)) { setMmError("Enter a number in mm."); return; }
    setMmError(null);
    setSection({ ...section, offset: Math.min(1, Math.max(0, (n - min) / (size || 1))) });
  }

  /**
   * lock the current section as the work area
   */
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
        <input className="field-control numeric" type="number" step={1} value={mmText ?? Number(atMm.toFixed(1))} onChange={(e) => setMmText(e.target.value)} onBlur={(e) => { commitMm(e.target.value); setMmText(null); }} onKeyDown={(e) => { if (e.key === "Enter") { commitMm((e.target as HTMLInputElement).value); setMmText(null); } }} aria-label="Section position in millimetres" aria-invalid={!!mmError} />
        mm
      </label>
      {mmError && <span className="field-hint" role="alert">{mmError}</span>}
      <button type="button" className="view-btn" onClick={() => setSection({ ...section, flipped: !section.flipped })} title="Keep the other side">Flip</button>
      <button type="button" className="btn-primary view-section-confirm" onClick={confirm} title="Detect, list, pick and draw only on the side you can see">Work here only</button>
      <button type="button" className="view-btn" onClick={() => setSection(null)} aria-label="Close section">Close</button>
    </div>
  );
}
