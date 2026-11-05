import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { MM_PER_UNIT, locateAlong, measure, partSizeMm, splitAtDistances } from "@weld/core";
import { SceneController } from "./viewer/SceneController";
import { seamColor } from "./viewer/seamColors";
import type { SurfacePoint } from "./viewer/SceneController";
import type { ViewId } from "./state/store";
import { candidateVisible, inWorkArea, mergeTargets, orderedSeams, seamLengthMm, useStore } from "./state/store";
import { JOINT_HELP } from "./ui/labels";
import { ViewControls } from "./ui/components/ViewControls";
import { WeldPlayer } from "./ui/components/WeldPlayer";
import { SeamDetails } from "./ui/components/SeamDetails";
import { ProcedureForm } from "./ui/components/ProcedureLibrary";
import { PartChip } from "./ui/components/PartChip";
import { OrientationGizmo } from "./viewer/OrientationGizmo";
import { formatSize } from "./domain/mesh/describe";

type DraftPoint = { point: [number, number, number]; normal: [number, number, number] };

const CLICK_SLOP_PX = 4;

/**
 * measure the hand-drawn draft points as a seam path
 */
function draftPath(all: DraftPoint[]) {
  
  const points = all.filter((p, i) => i === 0 || p.point.some((v, k) => v !== all[i - 1]!.point[k]));
  /**
   * flatten draft points or normals into one array
   */
  const flat = (key: "point" | "normal") => new Float32Array(points.flatMap((p) => p[key]));
  return measure({ points: flat("point"), normalsA: flat("normal"), normalsB: flat("normal"), closed: false, length: 0 });
}

/**
 * floating card pinned beside the panel, used for seam verdicts, seam ops and procedure editing
 */
function FloatCard({ title, onClose, min, onToggleMin, style, label, wide, footer, children }: {
  title: ReactNode; onClose: () => void; min: boolean; onToggleMin: () => void; style?: CSSProperties; label: string; wide?: boolean; footer?: ReactNode; children: ReactNode;
}) {
  return (
    <section className="seam-float result-card" style={{ position: "absolute", zIndex: 6, width: wide ? 340 : 300, maxWidth: "calc(100% - 24px)", ...style }} aria-label={label}>
      <header className="result-header">
        <span className="result-title">{title}</span>
        <span className="seam-head-actions">
          <button type="button" className="btn-link" onClick={onToggleMin} aria-expanded={!min}>{min ? "Expand" : "Collapse"}</button>
          <button type="button" className="btn-link" onClick={onClose}>Close</button>
        </span>
      </header>
      {!min && <div className="seam-float-body">{children}</div>}
      {!min && footer && <div className="seam-float-footer">{footer}</div>}
    </section>
  );
}

/**
 * measure the length along a path to a picked point
 */
function distanceAlong(path: { points: Float32Array }, segment: number, t: number) {
  const p = path.points, n = p.length / 3;
  let d = 0;
  for (let i = 0; i < segment; i++) d += Math.hypot(p[i * 3 + 3]! - p[i * 3]!, p[i * 3 + 4]! - p[i * 3 + 1]!, p[i * 3 + 5]! - p[i * 3 + 2]!);
  const j = (segment + 1) % n;
  return d + t * Math.hypot(p[j * 3]! - p[segment * 3]!, p[j * 3 + 1]! - p[segment * 3 + 1]!, p[j * 3 + 2]! - p[segment * 3 + 2]!);
}


/**
 * measure a padded box around seams for the camera
 */
function seamsBox(list: { points: Float32Array }[], diag: number) {
  const min: [number, number, number] = [Infinity, Infinity, Infinity], max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const x of list) for (let i = 0; i < x.points.length; i++) { const k = i % 3, v = x.points[i]!; if (v < min[k]!) min[k] = v; if (v > max[k]!) max[k] = v; }
  const pad = Math.max(diag * 0.04, Math.max(...max.map((v, k) => v - min[k]!)) * 0.35);
  return { min: min.map((v) => v - pad) as [number, number, number], max: max.map((v) => v + pad) as [number, number, number] };
}

/**
 * check whether the user is typing in a field
 */
function isTyping(target: EventTarget | null) {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
}

/**
 * render the 3d viewport and its seam tools
 */
export default function Viewport() {
  const hostRef = useRef<HTMLDivElement>(null);
  const ctrlRef = useRef<SceneController | null>(null);
  const [ctrl, setCtrl] = useState<SceneController | null>(null);
  const [gridMm, setGridMm] = useState<number | null>(null);
  const [draft, setDraft] = useState<DraftPoint[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [snapKind, setSnapKind] = useState<SurfacePoint["snapped"]>(null);

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
  const selectedCandidate = useStore((s) => {
    const x = s.seams.find((y) => y.id === s.selectedSeamId);
    return x && x.status === "candidate" ? x : null;
  });
  const selectedAccepted = useStore((s) => {
    const x = s.seams.find((y) => y.id === s.selectedSeamId);
    return x && x.status === "accepted" ? x : null;
  });
  const cardAnchor = useStore((s) => s.cardAnchor);
  const procDraft = useStore((s) => s.procDraft);
  const procEditId = useStore((s) => s.procEditId);
  const procEdit = useStore((s) => s.procedures.find((p) => p.id === s.procEditId) ?? null);
  const [floatMin, setFloatMin] = useState(false);
  useEffect(() => { setFloatMin(false); }, [selectedSeamId, procDraft?.id, procEditId, step]);
  const floatPos = { left: 12, top: cardAnchor ? `min(${Math.round(cardAnchor.y)}px, calc(100% - 340px))` : 52 } as CSSProperties;
  const hoverId = useStore((s) => s.hoverSeamId);
  const setHoverId = useStore((s) => s.setHoverSeam);
  const featureChains = useStore((s) => s.featureChains);
  const xray = useStore((s) => s.xray);
  const section = useStore((s) => s.section);
  const hiddenBodies = useStore((s) => s.hiddenBodies);
  const candidateFilter = useStore((s) => s.candidateFilter);
  const workArea = useStore((s) => s.workArea);

  
  const seamTools = step !== "part";
  const activeTool = step === "seams" ? tool : "select";

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
    setSnapKind(null);
    ctrlRef.current?.setSeamPreview(null);
    ctrlRef.current?.setSnapMarker(null);
  }, [activeTool]);

  const sequence = useStore((s) => s.sequence);

  
  useEffect(() => {
    const c = ctrlRef.current;
    if (!c) return;
    if (step !== "sequence" && step !== "review") { c.setSequence(null); return; }
    c.setSequence(orderedSeams({ seams, sequence }).map((x) => ({ points: x.points, closed: x.closed })));
  }, [step, seams, sequence]);

  const pendingAction = useStore((s) => s.pendingAction);
  const splitCuts = useStore((s) => s.splitCuts);

  
  useEffect(() => {
    if (pendingAction !== "split") return;
    const s = useStore.getState();
    const seam = s.seams.find((x) => x.id === s.selectedSeamId);
    const size = s.health?.bounds.size;
    if (seam && size) { const box = seamsBox([seam], Math.hypot(size.x, size.y, size.z)); ctrlRef.current?.fitBox(box.min, box.max); }
  }, [pendingAction]);

  
  useEffect(() => {
    const c = ctrlRef.current;
    if (!c) return;
    const seam = seams.find((x) => x.id === selectedSeamId);
    if (pendingAction !== "split" || !splitCuts || !seam) { c.setSplitPreview([], []); return; }
    const scale = MM_PER_UNIT[frame.units];
    const units = splitCuts.map((d) => d / scale);
    c.setSplitPreview(splitAtDistances(seam, units), units.map((d) => locateAlong(seam, d).point));
  }, [pendingAction, splitCuts, seams, selectedSeamId, frame.units]);

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

  const focus = useStore((s) => s.focus);

  
  useEffect(() => {
    const c = ctrlRef.current;
    if (!c || !mesh) return;
    const focused = focus && focus.bodies.length ? new Set(focus.bodies) : null;
    if (hiddenBodies.length === 0 && !focused) { c.setIndices(mesh.orientedIndices); c.setGhost(null); return; }
    const hidden = new Set(hiddenBodies);
    const kept: number[] = [], ghost: number[] = [];
    mesh.bodyOfTriangle.forEach((b, f) => {
      if (hidden.has(b)) return;
      (focused && !focused.has(b) ? ghost : kept).push(mesh.orientedIndices[f * 3]!, mesh.orientedIndices[f * 3 + 1]!, mesh.orientedIndices[f * 3 + 2]!);
    });
    c.setIndices(Uint32Array.from(kept));
    c.setGhost(ghost.length ? Uint32Array.from(ghost) : null);
  }, [hiddenBodies, mesh, focus]);

  useEffect(() => { if (focus) ctrlRef.current?.fitBox(focus.box.min, focus.box.max); }, [focus]);

  const cameraTarget = useStore((s) => s.cameraTarget);
  useEffect(() => {
    if (!cameraTarget) return;
    const s = useStore.getState();
    const list = s.seams.filter((x) => cameraTarget.ids.includes(x.id));
    const size = s.health?.bounds.size;
    if (list.length && size) { const box = seamsBox(list, Math.hypot(size.x, size.y, size.z)); ctrlRef.current?.fitBox(box.min, box.max); }
  }, [cameraTarget]);

  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const [undoVisible, setUndoVisible] = useState(false);
  useEffect(() => {
    if (!undo) { setUndoVisible(false); return; }
    setUndoVisible(true);
    
    const before = new Set(undo.state.seams.map((x) => x.id));
    const now = useStore.getState();
    const changed = now.seams.filter((x) => x.status === "accepted" && !before.has(x.id)).map((x) => x.id);
    const ids = changed.length ? changed : now.selectedSeamId ? [now.selectedSeamId] : [];
    const list = now.seams.filter((x) => ids.includes(x.id));
    const size = now.health?.bounds.size;
    
    if (list.length && size && !undo.label.startsWith("Deleted")) {
      const box = seamsBox(list, Math.hypot(size.x, size.y, size.z));
      ctrlRef.current?.fitBox(box.min, box.max);
    }
    requestAnimationFrame(() => ctrlRef.current?.flashSeams(ids, undo.label.startsWith("Reversed")));
    const t = setTimeout(() => setUndoVisible(false), 8000);
    return () => clearTimeout(t);
  }, [undo]);

  useEffect(() => {
    const c = ctrlRef.current;
    if (!c || !mesh) return;
    c.setPartTransform(MM_PER_UNIT[frame.units], frame.upAxis);
    setGridMm(c.getGridInterval());
  }, [frame.units, frame.upAxis, mesh]);

  useEffect(() => {
    const shown = seams.filter((s) => (step === "seams" ? candidateVisible(s, candidateFilter, frame.units) : s.status === "accepted") && inWorkArea(s, workArea));
    ctrlRef.current?.setSeamNames(new Map(shown.map((s) => [s.id, s.name])));
    ctrlRef.current?.setSeams(shown.map((s) => ({ id: s.id, points: s.points, closed: s.closed, status: s.status, color: seamColor(s) })));
  }, [seams, candidateFilter, frame.units, workArea, step]);

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

  
  /**
   * collect seam ends and edges for cursor snapping
   */
  function snapTargets() {
    const s = useStore.getState();
    const ends: [number, number, number][] = [];
    for (const x of s.seams) {
      if (x.status !== "accepted" || x.closed || !inWorkArea(x, s.workArea)) continue;
      const n = x.points.length / 3;
      ends.push([x.points[0]!, x.points[1]!, x.points[2]!], [x.points[n * 3 - 3]!, x.points[n * 3 - 2]!, x.points[n * 3 - 1]!]);
    }
    return { ends, edges: s.featureChains };
  }

  /**
   * save the drawn points as a seam and clear the draft
   */
  function finishDraft() {
    if (draft.length >= 2) {
      const id = useStore.getState().addSeam(draftPath(draft), "drawn");
      const touching = mergeTargets(useStore.getState().seams, id);
      if (touching.length) setNotice(`Connected to ${touching.map((x) => x.name).join(" and ")}. Use Merge to make them one weld.`);
    }
    setDraft([]);
    ctrlRef.current?.setSeamPreview(null);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (isTyping(e.target)) return;
      const s = useStore.getState();
      if (e.key === "Escape" && s.procDraft) { s.setProcDraft(null); return; }
      if (e.key === "Escape" && s.procEditId) { s.setProcEditId(null); return; }
      const k = e.key.toLowerCase();
      if ((e.metaKey || e.ctrlKey) && k === "z" && !e.shiftKey) { if (s.undo) { e.preventDefault(); s.undoLast(); } return; }
      if ((e.metaKey || e.ctrlKey) && (k === "y" || (k === "z" && e.shiftKey))) { if (s.redo) { e.preventDefault(); s.redoLast(); } return; }
      if ((e.metaKey || e.ctrlKey) && k === "a" && s.step === "seams") {
        e.preventDefault();
        const first = s.seams.find((x) => candidateVisible(x, s.candidateFilter, s.frame.units) && inWorkArea(x, s.workArea));
        if (first) s.selectSeam(first.id);
        return;
      }
      if (e.key === "?") { e.preventDefault(); setShowHelp((v) => !v); return; }
      if (["1", "2", "3", "4", "5"].includes(e.key)) {
        e.preventDefault();
        (["part", "seams", "procedures", "sequence", "review"] as const)[Number(e.key) - 1] && s.setStep((["part", "seams", "procedures", "sequence", "review"] as const)[Number(e.key) - 1]!);
        return;
      }
      if (k === "f") {
        e.preventDefault();
        if (e.shiftKey && s.selectedSeamId) s.frameSeams([s.selectedSeamId]);
        else ctrlRef.current?.fitModel(true);
        return;
      }
      if (k === "r") { e.preventDefault(); ctrlRef.current?.resetView(); return; }
      if (k === "w" && seamTools) { e.preventDefault(); const order = ["solid", "wireframe", "triangles"] as const; s.setViewMode(order[(order.indexOf(s.viewMode) + 1) % order.length]!); return; }
      if (k === "x" && seamTools) { e.preventDefault(); s.setXray(!s.xray); return; }
      if (s.step === "seams" && (k === "e" || k === "d")) { e.preventDefault(); s.setTool(k === "e" ? "edge" : "draw"); return; }
      if (!seamTools) return;
      if (activeTool === "draw") {
        if (e.key === "Enter") { e.preventDefault(); finishDraft(); }
        else if (e.key === "Backspace") { e.preventDefault(); setDraft((d) => d.slice(0, -1)); }
        else if (e.key === "Escape") { setDraft([]); ctrlRef.current?.setSeamPreview(null); ctrlRef.current?.setSnapMarker(null); }
        return;
      }
      if (k === "a" && s.step === "seams") {
        const sel = s.seams.find((x) => x.id === s.selectedSeamId);
        if (sel && sel.status === "candidate") { e.preventDefault(); s.acceptSeams([sel.id]); return; }
      }
      if (k === "v" && s.selectedSeamId) { e.preventDefault(); s.reverseSeam(s.selectedSeamId); return; }
      if (e.key === "Escape") { if (s.pendingAction) s.setPendingAction(null); else if (s.selectedSeamId) s.selectSeam(null); else if (s.focus) s.setFocus(null); else setShowHelp(false); }
      if (e.key === "Enter" && s.pendingAction === "split" && s.selectedSeamId) { e.preventDefault(); s.splitSeamAt(s.selectedSeamId, s.splitCuts ?? []); return; }
      if ((e.key === "Delete" || e.key === "Backspace") && s.selectedSeamId && s.step === "seams") { e.preventDefault(); s.deleteSeam(s.selectedSeamId); return; }
      if ((e.key === "Delete" || e.key === "Backspace") && !s.selectedSeamId && s.mesh && s.step === "part" && !s.pendingAction) {
        e.preventDefault();
        s.setConfirm({ title: "Erase part?", message: "Clear the part and all its seams? This cannot be undone.", confirmLabel: "Erase", danger: true, action: () => { const st = useStore.getState(); st.setPendingImport(null); st.loadAnother(); } });
        return;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const pointerDown = useRef<{ x: number; y: number } | null>(null);
  const moveFrame = useRef(0);

  /**
   * update hover, previews and snap markers for the tool
   */
  function onPointerMove(e: React.PointerEvent) {
    if (!seamTools || !ctrlRef.current) return;
    const { clientX, clientY } = e;
    cancelAnimationFrame(moveFrame.current);
    moveFrame.current = requestAnimationFrame(() => {
      const c = ctrlRef.current;
      if (!c) return;
      const s = useStore.getState();
      const selected = s.pendingAction === "split" ? s.seams.find((x) => x.id === s.selectedSeamId) : undefined;
      if (activeTool === "select" && selected) {
        if ((s.splitCuts?.length ?? 0) <= 1) {
          const hit = c.pickPath([selected], { clientX, clientY }, 24);
          if (hit) s.setSplitCuts([Math.round(distanceAlong(selected, hit.segment, hit.t) * MM_PER_UNIT[s.frame.units] * 10) / 10]);
        }
      } else if (activeTool === "select") {
        setHoverId(c.pickSeam({ clientX, clientY }));
      } else if (activeTool === "edge") {
        const hit = c.pickPath(featureChains, { clientX, clientY });
        const chain = hit ? featureChains[hit.index]! : null;
        c.setSeamPreview(chain ? chain.points : null, chain?.closed);
      } else if (activeTool === "draw") {
        const surface = c.surfacePoint({ clientX, clientY }, snapTargets());
        c.setSnapMarker(surface?.point ?? null, surface?.snapped ?? "surface");
        setSnapKind(surface?.snapped ?? null);
        if (draft.length > 0) c.setSeamPreview(draftPath(surface ? [...draft, surface] : draft).points);
      }
    });
  }

  /**
   * apply the active tool at the click point
   */
  function onPointerUp(e: React.PointerEvent) {
    const start = pointerDown.current;
    pointerDown.current = null;
    if (!seamTools || !start || Math.hypot(e.clientX - start.x, e.clientY - start.y) > CLICK_SLOP_PX || e.button !== 0) return;
    const c = ctrlRef.current;
    if (!c) return;
    const s = useStore.getState();

    if (activeTool === "draw") {
      const surface = c.surfacePoint(e, snapTargets());
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
      if ((s.splitCuts?.length ?? 0) <= 1) {
        const hit = c.pickPath([selected], e, 24);
        if (!hit) { setErr("Click on the orange seam, or use the slider in the panel."); return; }
        s.setSplitCuts([distanceAlong(selected, hit.segment, hit.t) * MM_PER_UNIT[s.frame.units]]);
      }
      const ids = useStore.getState().splitSeamAt(selected.id, useStore.getState().splitCuts ?? []);
      const after = useStore.getState();
      const parts = after.seams.filter((x) => ids.includes(x.id));
      setErr(null);
      if (parts.length > 1) setNotice(`Cut into ${parts.map((x) => `${x.name} (${seamLengthMm(x, after.frame.units).toFixed(1)} mm)`).join(", ")}.`);
      else if (parts.length === 1) setNotice(`Loop opened: ${parts[0]!.name} now starts and ends at the cut.`);
      return;
    }
    if (s.pendingAction === "merge" && selected) {
      const other = c.pickSeam(e);
      const error = other ? s.mergeSeams(selected.id, other) : "Click the seam to merge with.";
      if (error) setErr(error); else setErr(null);
      return;
    }
    s.selectSeam(c.pickSeam(e));
    const picked = useStore.getState().selectedSeamId;
    if (picked && hostRef.current) {
      const r = hostRef.current.getBoundingClientRect();
      useStore.getState().setCardAnchor({ x: 12, y: Math.max(8, e.clientY - r.top - 140) });
    }
  }

  const sizeMm = health ? partSizeMm(health.bounds.size, frame.units, frame.upAxis) : null;
  const snapText = snapKind === "end" ? " Snapped to a seam end." : snapKind === "corner" ? " Snapped to a corner." : snapKind === "edge" ? " Snapped to an edge." : "";
  const drawHint = activeTool === "draw" ? (draft.length === 0 ? `Click on the part to start a seam. Points snap to seam ends, corners and edges.${snapText}` : `${draft.length} point${draft.length === 1 ? "" : "s"}.${snapText} Enter or double-click to finish, Backspace to undo, Esc to cancel.`) : null;
  const pending = useStore((s) => s.pendingAction);
  const mergeNames = useStore((s) => (s.pendingAction === "merge" && s.selectedSeamId ? mergeTargets(s.seams, s.selectedSeamId).map((x) => x.name).join(" or ") : ""));
  const pendingHint = pending === "split" ? "Move along the seam: the cut follows. The lighter part is the new seam. Click or press Split to cut, Esc to cancel." : pending === "merge" ? `Click ${mergeNames || "a touching seam"} to join it. Esc to cancel.` : null;

  return (
    <div className={`viewport-wrapper${activeTool !== "select" ? " viewport-host-draw" : ""}`}>
      <div
        ref={hostRef}
        className="viewport-canvas"
        onPointerDown={(e) => { pointerDown.current = { x: e.clientX, y: e.clientY }; }}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onDoubleClick={() => { if (activeTool === "draw") finishDraft(); }}
        onPointerLeave={() => { setHoverId(null); if (activeTool === "draw" || pendingAction === "split") ctrlRef.current?.setSnapMarker(null); }}
      />
      <ViewControls controller={ctrl} />
      <div className="part-pill-float"><PartChip /></div>
      {step === "seams" && selectedCandidate && (
        <FloatCard key={selectedCandidate.id} title="Suggestion" label="Review suggestion" min={floatMin} onToggleMin={() => setFloatMin((v) => !v)} onClose={() => useStore.getState().selectSeam(null)} style={floatPos}>
          <p className="review-what"><strong>{selectedCandidate.reason}</strong> · {seamLengthMm(selectedCandidate, frame.units).toFixed(1)} mm · {selectedCandidate.confidence >= 0.85 ? "high" : selectedCandidate.confidence >= 0.7 ? "medium" : "low"} confidence</p>
          <p className="result-explainer">{JOINT_HELP[selectedCandidate.jointType]} Confidence is high for clean right-angle corners and lower for unusual angles or touching parts.</p>
          <div className="result-actions result-actions-split">
            <button type="button" className="btn-secondary" onClick={() => useStore.getState().rejectSeams([selectedCandidate.id])}><span className="tick">✕</span> Drop</button>
            <button type="button" className="btn-primary" onClick={() => useStore.getState().acceptSeams([selectedCandidate.id])}><span className="tick">✓</span> Keep</button>
          </div>
        </FloatCard>
      )}
      {step === "seams" && selectedAccepted && (
        <div key={selectedAccepted.id} style={{ position: "absolute", zIndex: 6, width: 300, maxWidth: "calc(100% - 24px)", ...floatPos }}>
          <SeamDetails min={floatMin} onToggleMin={() => setFloatMin((v) => !v)} />
        </div>
      )}
      {step === "procedures" && procDraft && (
        <FloatCard key={procDraft.id} wide title={<span className="proc-draft-name">Custom procedure</span>} label="New custom procedure" min={floatMin} onToggleMin={() => setFloatMin((v) => !v)} onClose={() => useStore.getState().setProcDraft(null)} style={floatPos} footer={<><button type="button" className="btn-secondary" onClick={() => useStore.getState().setProcDraft(null)}>Discard</button><button type="button" className="btn-primary" onClick={() => { const s = useStore.getState(); if (s.procDraft) { s.saveProcedure(s.procDraft); s.setProcDraft(null); } }}>Apply changes</button></>}>
          <p className="result-explainer">Set your own values, then Apply to add it to the library.</p>
          <ProcedureForm procedure={procDraft} onChange={(p) => useStore.getState().setProcDraft(p)} />
        </FloatCard>
      )}
      {step === "procedures" && !procDraft && procEdit && (
        <FloatCard key={procEdit.id} wide title={procEdit.name} label={`Edit ${procEdit.name}`} min={floatMin} onToggleMin={() => setFloatMin((v) => !v)} onClose={() => useStore.getState().setProcEditId(null)} style={floatPos}>
          <ProcedureForm procedure={procEdit} onChange={(p) => useStore.getState().saveProcedure(p)} />
        </FloatCard>
      )}
      <div className="orientation-gizmo-host">
        <OrientationGizmo controller={ctrl} onView={(id: ViewId) => { setView(id); ctrl?.setView(id); }} />
      </div>
      {(phase === "analysing" || phase === "repairing") && <div className="scanline" aria-hidden="true" />}
      {(step === "sequence" || step === "review") && <WeldPlayer controller={ctrl} />}
      {focus && (
        <div className="view-chip focus-chip" role="status">
          <span>Focused on <strong>{focus.label}</strong>{focus.bodies.length ? `, ${focus.bodies.length} part${focus.bodies.length === 1 ? "" : "s"}` : ""}</span>
          <button type="button" className="btn-link" onClick={() => { useStore.getState().setFocus(null); ctrlRef.current?.fitModel(true); }}>Show all</button>
        </div>
      )}
      {(undo && undoVisible) || redo ? (
        <div className="undo-toast" role="status">
          <span>{(undo && undoVisible ? undo.label : redo?.label) ?? ""}.</span>
          {undo && undoVisible && <button type="button" className="btn-link" onClick={() => { useStore.getState().undoLast(); setUndoVisible(false); }}>Undo</button>}
          {(!undo || !undoVisible) && redo && <button type="button" className="btn-link" onClick={() => useStore.getState().redoLast()}>Redo</button>}
          <span className="undo-key">Ctrl/⌘ Z</span>
        </div>
      ) : null}
      {(drawHint || pendingHint || notice) && !err && <div className="viewport-hint" role="status">{notice ?? pendingHint ?? drawHint}</div>}
      {err && (
        <div className="viewport-hint viewport-hint-error" role="alert">
          <span>{err}</span>
          <button type="button" className="btn-link" onClick={() => setErr(null)}>Dismiss</button>
        </div>
      )}
      {showHelp && (
        <div className="shortcut-overlay" role="dialog" aria-label="Keyboard shortcuts">
          <div className="shortcut-card">
            <header className="result-header"><span className="result-title">Shortcuts (?)</span><button type="button" className="btn-link" onClick={() => setShowHelp(false)}>Close</button></header>
            <dl className="shortcut-list">
              <div><dt>1–5</dt><dd>Steps</dd></div>
              <div><dt>F / Shift+F</dt><dd>Fit all / fit selection</dd></div>
              <div><dt>R</dt><dd>Reset view</dd></div>
              <div><dt>W</dt><dd>Next render mode</dd></div>
              <div><dt>X</dt><dd>X-ray</dd></div>
              <div><dt>E / D</dt><dd>Pick edge / Draw</dd></div>
              <div><dt>A</dt><dd>Accept selected candidate</dd></div>
              <div><dt>V</dt><dd>Reverse selected</dd></div>
              <div><dt>Enter / Esc</dt><dd>Finish / cancel</dd></div>
              <div><dt>Ctrl/⌘ Z / Y</dt><dd>Undo / redo</dd></div>
            </dl>
          </div>
        </div>
      )}
      <div className="narrow-notice" role="note">Best on a larger screen — picking needs precision.</div>
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
