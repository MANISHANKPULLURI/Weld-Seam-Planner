import { useEffect, useRef, useState } from "react";
import { MM_PER_UNIT, partSizeMm } from "@weld/core";
import { SceneController } from "./viewer/SceneController";
import type { ViewId } from "./state/store";
import { useStore } from "./state/store";
import { ViewControls } from "./ui/components/ViewControls";
import { OrientationGizmo } from "./viewer/OrientationGizmo";
import { formatSize } from "./domain/mesh/describe";

export default function Viewport() {
  const hostRef = useRef<HTMLDivElement>(null);
  const ctrlRef = useRef<SceneController | null>(null);
  const [ctrl, setCtrl] = useState<SceneController | null>(null);
  const [gridMm, setGridMm] = useState<number | null>(null);
  const phase = useStore((s) => s.phase);
  const mesh = useStore((s) => s.mesh);
  const health = useStore((s) => s.health);
  const frame = useStore((s) => s.frame);
  const tool = useStore((s) => s.tool);
  const setView = useStore((s) => s.setView);
  const projection = useStore((s) => s.projection);
  const viewMode = useStore((s) => s.viewMode);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const c = new SceneController(host);
    ctrlRef.current = c;
    setCtrl(c);
    c.onViewChangeCallback((id) => setView(id));
    return () => { c.dispose(); ctrlRef.current = null; };
  }, [setView]);

  useEffect(() => {
    if (hostRef.current) hostRef.current.dataset.tool = tool;
  }, [tool]);

  useEffect(() => {
    const c = ctrlRef.current;
    if (!c) return;
    if (mesh) {
      c.setPartTransform(MM_PER_UNIT[useStore.getState().frame.units], useStore.getState().frame.upAxis, false);
      c.setMesh(mesh.positions, mesh.indices);
      c.fadeIn();
    } else {
      c.clearMesh();
    }
    setGridMm(mesh ? c.getGridInterval() : null);
  }, [mesh]);

  useEffect(() => {
    const c = ctrlRef.current;
    if (!c || !mesh) return;
    c.setPartTransform(MM_PER_UNIT[frame.units], frame.upAxis);
    setGridMm(c.getGridInterval());
  }, [frame.units, frame.upAxis, mesh]);

  useEffect(() => {
    ctrlRef.current?.setDimmed(phase === "analysing" || phase === "repairing");
  }, [phase]);

  useEffect(() => {
    const onTheme = () => ctrlRef.current?.updateTheme();
    window.addEventListener("themechange", onTheme);
    return () => window.removeEventListener("themechange", onTheme);
  }, []);

  useEffect(() => { if (ctrl) ctrl.setProjection(projection); }, [ctrl, projection]);
  useEffect(() => { if (ctrl) ctrl.setViewMode(viewMode); }, [ctrl, viewMode]);

  function handleGizmoView(id: ViewId) {
    setView(id);
    ctrl?.setView(id);
  }

  const sizeMm = health ? partSizeMm(health.bounds.size, frame.units, frame.upAxis) : null;

  return (
    <div className={`viewport-wrapper${tool === "draw" ? " viewport-host-draw" : ""}`}>
      <div ref={hostRef} className="viewport-canvas" />
      <ViewControls controller={ctrl} />
      <div className="orientation-gizmo-host">
        <OrientationGizmo controller={ctrl} onView={handleGizmoView} />
      </div>
      {(phase === "analysing" || phase === "repairing") && <div className="scanline" aria-hidden="true" />}
      {sizeMm && (
        <div className="view-chip view-controls-bottom-left">
          <span className="numeric">{formatSize(sizeMm)} mm</span>
          {gridMm !== null && <span className="view-chip-sep">Grid {gridMm} mm</span>}
          <span className="view-chip-sep">Z up</span>
          {!frame.confirmed && <span className="view-chip-warn">Units not confirmed</span>}
        </div>
      )}
    </div>
  );
}
