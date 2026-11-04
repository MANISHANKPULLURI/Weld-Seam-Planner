import { useEffect, useRef, useState } from "react";
import { MM_PER_UNIT, measure, partSizeMm } from "@weld/core";
import { SceneController } from "./viewer/SceneController";
import type { ViewId } from "./state/store";
import { useStore } from "./state/store";
import { ViewControls } from "./ui/components/ViewControls";
import { OrientationGizmo } from "./viewer/OrientationGizmo";
import { formatSize } from "./domain/mesh/describe";

type DraftPoint = { point: [number, number, number]; normal: [number, number, number] };

const CLICK_SLOP_PX = 4;

function draftPath(all: DraftPoint[]) {
  // A double-click to finish lands two clicks on the same spot; drop repeated points.
  const points = all.filter((p, i) => i === 0 || p.point.some((v, k) => v !== all[i - 1]!.point[k]));
  const flat = (key: "point" | "normal") => new Float32Array(points.flatMap((p) => p[key]));
  return measure({ points: flat("point"), normalsA: flat("normal"), normalsB: flat("normal"), closed: false, length: 0 });
}

function isTyping(target: EventTarget | null) {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
}

export default function Viewport() {
  const hostRef = useRef<HTMLDivElement>(null);
  const ctrlRef = useRef<SceneController | null>(null);
  const [ctrl, setCtrl] = useState<SceneController | null>(null);
  const [gridMm, setGridMm] = useState<number | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftPoint[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  const phase = useStore((s) => s.phase);
  const mesh = useStore((s) => s.mesh);
  const health = useStore((s) => s.health);
  const frame = useStore((s) => s.frame);
  const tool = useStore((s) => s.tool);
  const step = useStore((s) => s.step);
  const setView = useStore((s) => s.setView);
  const projection = useStore((s) => s.projection);
  const viewMode = useStore((s) => s.viewMode);
  const seams = useStore((s) => s.seams);
  const selectedSeamId = useStore((s) => s.selectedSeamId);
  const featureChains = useStore((s) => s.featureChains);
  const xray = useStore((s) => s.xray);
  const section = useStore((s) => s.section);
  const hiddenBodies = useStore((s) => s.hiddenBodies);

  const seamTools = step === "seams";
  const activeTool = seamTools ? tool : "select";

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
    if (hostRef.current) hostRef.current.dataset.tool = activeTool;
    setDraft([]);
    setHoverId(null);
    ctrlRef.current?.setSeamPreview(null);
  }, [activeTool]);

  useEffect(() => {
    const c = ctrlRef.current;
    if (!c) return;
    if (mesh) {
      c.setPartTransform(MM_PER_UNIT[useStore.getState().frame.units], useStore.getState().frame.upAxis, false);
      c.setMesh(mesh.positions, mesh.orientedIndices);
      c.fadeIn();
    } else {
      c.clearMesh();
    }
    setGridMm(mesh ? c.getGridInterval() : null);
  }, [mesh]);

  useEffect(() => {
    const c = ctrlRef.current;
    if (!c || !mesh) return;
    if (hiddenBodies.length === 0) { c.setIndices(mesh.orientedIndices); return; }
    const hidden = new Set(hiddenBodies);
    const kept: number[] = [];
    mesh.bodyOfTriangle.forEach((b, f) => { if (!hidden.has(b)) kept.push(mesh.orientedIndices[f * 3]!, mesh.orientedIndices[f * 3 + 1]!, mesh.orientedIndices[f * 3 + 2]!); });
    c.setIndices(Uint32Array.from(kept));
  }, [hiddenBodies, mesh]);

  useEffect(() => {
    const c = ctrlRef.current;
    if (!c || !mesh) return;
    c.setPartTransform(MM_PER_UNIT[frame.units], frame.upAxis);
    setGridMm(c.getGridInterval());
  }, [frame.units, frame.upAxis, mesh]);

  useEffect(() => {
    ctrlRef.current?.setSeams(seams.map((s) => ({ id: s.id, points: s.points, closed: s.closed, status: s.status })));
  }, [seams]);

  useEffect(() => { ctrlRef.current?.setSeamHighlight(selectedSeamId, hoverId); }, [selectedSeamId, hoverId, seams]);
  useEffect(() => { ctrlRef.current?.setXray(xray); }, [xray]);
  useEffect(() => { ctrlRef.current?.setSection(section); }, [section, mesh, frame.units, frame.upAxis]);

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

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 3500);
    return () => clearTimeout(timer);
  }, [notice]);

  function finishDraft() {
    if (draft.length >= 2) useStore.getState().addSeam(draftPath(draft), "drawn");
    setDraft([]);
    ctrlRef.current?.setSeamPreview(null);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (isTyping(e.target) || !seamTools) return;
      const s = useStore.getState();
      if (activeTool === "draw") {
        if (e.key === "Enter") { e.preventDefault(); finishDraft(); }
        else if (e.key === "Backspace") { e.preventDefault(); setDraft((d) => d.slice(0, -1)); }
        else if (e.key === "Escape") { setDraft([]); ctrlRef.current?.setSeamPreview(null); }
        return;
      }
      if (e.key === "Escape") { if (s.pendingAction) s.setPendingAction(null); else s.selectSeam(null); }
      if ((e.key === "Delete" || e.key === "Backspace") && s.selectedSeamId) { e.preventDefault(); s.deleteSeam(s.selectedSeamId); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const pointerDown = useRef<{ x: number; y: number } | null>(null);
  const moveFrame = useRef(0);

  function onPointerMove(e: React.PointerEvent) {
    if (!seamTools || !ctrlRef.current) return;
    const { clientX, clientY } = e;
    cancelAnimationFrame(moveFrame.current);
    moveFrame.current = requestAnimationFrame(() => {
      const c = ctrlRef.current;
      if (!c) return;
      if (activeTool === "select") {
        setHoverId(c.pickSeam({ clientX, clientY }));
      } else if (activeTool === "edge") {
        const hit = c.pickPath(featureChains, { clientX, clientY });
        const chain = hit ? featureChains[hit.index]! : null;
        c.setSeamPreview(chain ? chain.points : null, chain?.closed);
      } else if (activeTool === "draw" && draft.length > 0) {
        const surface = c.surfacePoint({ clientX, clientY });
        c.setSeamPreview(draftPath(surface ? [...draft, surface] : draft).points);
      }
    });
  }

  function onPointerUp(e: React.PointerEvent) {
    const start = pointerDown.current;
    pointerDown.current = null;
    if (!seamTools || !start || Math.hypot(e.clientX - start.x, e.clientY - start.y) > CLICK_SLOP_PX || e.button !== 0) return;
    const c = ctrlRef.current;
    if (!c) return;
    const s = useStore.getState();

    if (activeTool === "draw") {
      const surface = c.surfacePoint(e);
      if (surface) setDraft((d) => [...d, surface]);
      return;
    }

    if (activeTool === "edge") {
      const hit = c.pickPath(featureChains, e);
      if (!hit) return;
      const chain = featureChains[hit.index]!;
      s.addSeam(chain, "edge_chain");
      c.setSeamPreview(null);
      return;
    }

    const selected = s.seams.find((x) => x.id === s.selectedSeamId);
    if (s.pendingAction === "split" && selected) {
      const hit = c.pickPath([selected], e, 12);
      if (hit) s.splitSeam(selected.id, hit.segment, hit.t);
      else setNotice("Click on the selected seam where it should be split.");
      return;
    }
    if (s.pendingAction === "merge" && selected) {
      const other = c.pickSeam(e);
      const error = other ? s.mergeSeams(selected.id, other) : "Click the seam to merge with.";
      if (error) setNotice(error);
      return;
    }
    s.selectSeam(c.pickSeam(e));
  }

  const sizeMm = health ? partSizeMm(health.bounds.size, frame.units, frame.upAxis) : null;
  const drawHint = activeTool === "draw" ? (draft.length === 0 ? "Click on the part to start a seam." : `${draft.length} point${draft.length === 1 ? "" : "s"}. Enter or double-click to finish, Backspace to undo, Esc to cancel.`) : null;
  const pending = useStore((s) => s.pendingAction);
  const pendingHint = pending === "split" ? "Click on the selected seam where it should be split. Esc to cancel." : pending === "merge" ? "Click the seam to merge with. Esc to cancel." : null;

  return (
    <div className={`viewport-wrapper${activeTool !== "select" ? " viewport-host-draw" : ""}`}>
      <div
        ref={hostRef}
        className="viewport-canvas"
        onPointerDown={(e) => { pointerDown.current = { x: e.clientX, y: e.clientY }; }}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onDoubleClick={() => { if (activeTool === "draw") finishDraft(); }}
        onPointerLeave={() => setHoverId(null)}
      />
      <ViewControls controller={ctrl} />
      <div className="orientation-gizmo-host">
        <OrientationGizmo controller={ctrl} onView={(id: ViewId) => { setView(id); ctrl?.setView(id); }} />
      </div>
      {(phase === "analysing" || phase === "repairing") && <div className="scanline" aria-hidden="true" />}
      {(drawHint || pendingHint || notice) && <div className="viewport-hint" role="status">{notice ?? pendingHint ?? drawHint}</div>}
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
