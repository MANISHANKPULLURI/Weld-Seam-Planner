import { useEffect, useRef, useState } from "react";
import { SceneController } from "./viewer/SceneController";
import { useStore } from "./state/store";
import { ViewControls } from "./ui/components/ViewControls";

export default function Viewport() {
  const hostRef = useRef<HTMLDivElement>(null);
  const ctrlRef = useRef<SceneController | null>(null);
  const [ctrl, setCtrl] = useState<SceneController | null>(null);
  const phase = useStore((s) => s.phase);
  const mesh = useStore((s) => s.mesh);
  const health = useStore((s) => s.health);
  const tool = useStore((s) => s.tool);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const c = new SceneController(host);
    ctrlRef.current = c;
    setCtrl(c);
    return () => { c.dispose(); ctrlRef.current = null; };
  }, []);

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

  const size = health?.bounds.size;
  return (
    <div className={`viewport-wrapper${tool === "draw" ? " viewport-host-draw" : ""}`}>
      <div ref={hostRef} className="viewport-canvas" />
      <ViewControls controller={ctrl} />
      {(phase === "analysing" || phase === "repairing") && <div className="scanline" aria-hidden="true" />}
      {size && (
        <div className="view-chip view-controls-bottom-left">
          <span className="numeric">{size.x.toFixed(1)} × {size.y.toFixed(1)} × {size.z.toFixed(1)} model units · Z up</span>
        </div>
      )}
    </div>
  );
}
