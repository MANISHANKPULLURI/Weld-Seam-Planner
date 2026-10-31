import { useStore } from "../../state/store";
import { GridIcon, RefreshIcon, CubeIcon } from "../icons";

export function ViewControls({ controller }: { controller: import("../../viewer/SceneController").SceneController | null }) {
  const projection = useStore((s) => s.projection);
  const wireframe = useStore((s) => s.wireframe);
  const view = useStore((s) => s.view);
  const setProjection = useStore((s) => s.setProjection);
  const toggleWireframe = useStore((s) => s.toggleWireframe);
  const setView = useStore((s) => s.setView);

  function proj(p: "perspective" | "orthographic") {
    setProjection(p);
    controller?.setProjection(p);
  }
  function wire() {
    toggleWireframe();
    controller?.setWireframe(!wireframe);
  }
  function reset() {
    controller?.resetView();
  }
  function v(id: "iso" | "top" | "front" | "right") {
    setView(id);
    controller?.setView(id);
  }

  return (
    <>
      <div className="view-controls view-controls-top">
        <div className="view-segmented" role="group" aria-label="Projection">
          <button type="button" aria-pressed={projection === "perspective"} onClick={() => proj("perspective")}>Perspective</button>
          <button type="button" aria-pressed={projection === "orthographic"} onClick={() => proj("orthographic")}>Orthographic</button>
        </div>
        <button type="button" className={`view-btn${wireframe ? " view-btn-active" : ""}`} aria-pressed={wireframe} onClick={wire} aria-label="Toggle wireframe">
          <GridIcon size={12} /> Wireframe
        </button>
        <button type="button" className="view-btn" onClick={reset} aria-label="Reset view">
          <RefreshIcon size={12} /> Reset view
        </button>
      </div>
      <div className="view-controls view-controls-bottom-right">
        {(["iso", "top", "front", "right"] as const).map((id) => (
          <button key={id} type="button" className={`view-btn${view === id ? " view-btn-active" : ""}`} onClick={() => v(id)} aria-label={`View ${id}`} aria-pressed={view === id}>
            {id === "iso" ? <CubeIcon size={12} /> : null} {id.charAt(0).toUpperCase() + id.slice(1)}
          </button>
        ))}
      </div>
    </>
  );
}
