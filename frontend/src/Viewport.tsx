import { useEffect, useRef, useState } from "react";
import { SceneController } from "./viewer/SceneController";
import type { ViewId } from "./state/store";
import { useStore } from "./state/store";
import { ViewControls } from "./ui/components/ViewControls";
import { OrientationGizmo } from "./viewer/OrientationGizmo";

export default function Viewport() {
  const hostRef = useRef<HTMLDivElement>(null);
  const ctrlRef = useRef<SceneController | null>(null);
  const [ctrl, setCtrl] = useState<SceneController | null>(null);
  const phase = useStore((s) => s.phase);
  const mesh = useStore((s) => s.mesh);
  const health = useStore((s) => s.health);
  const tool = useStore((s) => s.tool);
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const c = new SceneController(host);
    ctrlRef.current = c;
    setCtrl(c);
    c.onViewChangeCallback((id) => setView(id));
    return () => { c.dispose(); ctrlRef.current = null; };
  }, [setView]);

  // keep host dataset for seam-draw guard in SceneController double-click
  useEffect(() => {
    if (hostRef.current) hostRef.current.dataset.tool = tool;
  }, [tool]);

  useEffect(() => {
    const c = ctrlRef.current;
    if (!c) return;
    if (mesh) { c.setMesh(mesh.positions, mesh.indices); c.fadeIn(); }
    else c.clearMesh();
  }, [mesh]);

  useEffect(() => {
    const c = ctrlRef.current;
    if (!c) return;
    c.setDimmed(phase === "analysing" || phase === "repairing");
  }, [phase]);

  useEffect(() => {
    const onTheme = () => ctrlRef.current?.updateTheme();
    window.addEventListener("themechange", onTheme);
    return () => window.removeEventListener("themechange", onTheme);
  }, []);

  // sync viewMode/projection if store changes externally (e.g., initial)
  const projection = useStore((s) => s.projection);
  const viewMode = useStore((s) => s.viewMode);
  useEffect(() => { if (ctrl) ctrl.setProjection(projection); }, [ctrl, projection]);
  useEffect(() => { if (ctrl) ctrl.setViewMode(viewMode); }, [ctrl, viewMode]);

  const size = health?.bounds.size;

  function handleGizmoView(id: ViewId) {
    setView(id);
    ctrl?.setView(id);
  }

  return (
    <div className={`viewport-wrapper${tool === "draw" ? " viewport-host-draw" : ""}`}>
      <div ref={hostRef} className="viewport-canvas" />
      <ViewControls controller={ctrl} />
      {/* Orientation gizmo — bottom-left above size chip, or top-left */}
      <div className="orientation-gizmo-host">
        <OrientationGizmo controller={ctrl} onView={handleGizmoView} />
      </div>
      {(phase === "analysing" || phase === "repairing") && <div className="scanline" aria-hidden="true" />}
      {size && (
        <div className="view-chip view-controls-bottom-left">
          <span className="numeric">{size.x.toFixed(1)} × {size.y.toFixed(1)} × {size.z.toFixed(1)} model units · Z up</span>
        </div>
      )}
    </div>
  );
}
