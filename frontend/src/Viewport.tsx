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
  const components = useStore((s) => s.components);
  const inputMode = useStore((s) => s.inputMode);
  const selectedId = useStore((s) => s.selectedComponentId);
  const isolatedId = useStore((s) => s.isolatedComponentId);
  const explodedFactor = useStore((s) => s.explodedFactor);
  const transformMode = useStore((s) => s.transformMode);
  const selectComponent = useStore((s) => s.selectComponent);
  const setComponentTransform = useStore((s) => s.setComponentTransform);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const c = new SceneController(host);
    ctrlRef.current = c;
    setCtrl(c);
    (host as unknown as { __sceneController?: unknown }).__sceneController = c;
    (window as unknown as { __sceneController?: unknown }).__sceneController = c;
    c.onViewChangeCallback((id) => setView(id));
    c.onSelect((id) => selectComponent(id));
    c.onTransform((id, t) => setComponentTransform(id, t));
    return () => { c.dispose(); ctrlRef.current = null; (window as unknown as { __sceneController?: unknown }).__sceneController = undefined; };
  }, [setView, selectComponent, setComponentTransform]);

  useEffect(() => {
    if (hostRef.current) hostRef.current.dataset.tool = tool;
  }, [tool]);

  useEffect(() => {
    const c = ctrlRef.current;
    if (!c) return;
    if (inputMode === "multiple" && components.length > 0) {
      const validated = components.filter((co) => co.status === "validated" && co.positions.length > 0);
      if (validated.length > 0) {
        c.setComponents(validated.map((co) => ({ id: co.id, positions: co.positions, indices: co.indices, transform: co.transform, visible: co.visible, locked: co.locked, bounds: co.bounds })));
        c.fadeIn();
      } else c.clearMesh();
    } else if (mesh) {
      c.setMesh(mesh.positions, mesh.indices);
      c.fadeIn();
    } else c.clearMesh();
  }, [mesh, components, inputMode]);

  useEffect(() => { const c = ctrlRef.current; if (!c) return; c.setSelection(selectedId); }, [selectedId]);
  useEffect(() => { const c = ctrlRef.current; if (!c) return; c.setIsolated(isolatedId); }, [isolatedId]);
  useEffect(() => { const c = ctrlRef.current; if (!c) return; c.setExplodedFactor(explodedFactor); }, [explodedFactor]);
  useEffect(() => { const c = ctrlRef.current; if (!c) return; c.setTransformMode(transformMode); }, [transformMode]);
  useEffect(() => {
    const c = ctrlRef.current;
    if (!c || inputMode !== "multiple") return;
    for (const comp of components) c.updateComponentTransform(comp.id, comp.transform);
    for (const comp of components) c.setVisibility(comp.id, comp.visible);
  }, [components, inputMode]);

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

  const projection = useStore((s) => s.projection);
  const viewMode = useStore((s) => s.viewMode);
  useEffect(() => { if (ctrl) ctrl.setProjection(projection); }, [ctrl, projection]);
  useEffect(() => { if (ctrl) ctrl.setViewMode(viewMode); }, [ctrl, viewMode]);

  const aggSize = (() => {
    if (inputMode !== "multiple" || components.length === 0) return null;
    const vals = components.filter((c) => c.status === "validated" && c.bounds);
    if (vals.length === 0) return null;
    let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (const c of vals) { minX = Math.min(minX, c.bounds.min.x); minY = Math.min(minY, c.bounds.min.y); minZ = Math.min(minZ, c.bounds.min.z); maxX = Math.max(maxX, c.bounds.max.x); maxY = Math.max(maxY, c.bounds.max.y); maxZ = Math.max(maxZ, c.bounds.max.z); }
    return { x: maxX - minX, y: maxY - minY, z: maxZ - minZ };
  })();
  const size = inputMode === "multiple" ? aggSize : health?.bounds.size;

  function handleGizmoView(id: ViewId) {
    setView(id);
    ctrl?.setView(id);
  }

  return (
    <div className={`viewport-wrapper${tool === "draw" ? " viewport-host-draw" : ""}`}>
      <div ref={hostRef} className="viewport-canvas" />
      <ViewControls controller={ctrl} />
      {}
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
