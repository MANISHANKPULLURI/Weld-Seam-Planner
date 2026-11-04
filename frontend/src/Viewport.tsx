import { useEffect, useRef, useState } from "react";
import { MM_PER_UNIT, locateAlong, measure, partSizeMm, splitAtDistances } from "@weld/core";
import { SceneController } from "./viewer/SceneController";
import { seamColor } from "./viewer/seamColors";
import type { SurfacePoint } from "./viewer/SceneController";
import type { ViewId } from "./state/store";
import { candidateVisible, inWorkArea, mergeTargets, orderedSeams, seamLengthMm, useStore } from "./state/store";
import { ViewControls } from "./ui/components/ViewControls";
import { WeldPlayer } from "./ui/components/WeldPlayer";
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

function distanceAlong(path: { points: Float32Array }, segment: number, t: number) {
  const p = path.points, n = p.length / 3;
  let d = 0;
  for (let i = 0; i < segment; i++) d += Math.hypot(p[i * 3 + 3]! - p[i * 3]!, p[i * 3 + 4]! - p[i * 3 + 1]!, p[i * 3 + 5]! - p[i * 3 + 2]!);
  const j = (segment + 1) % n;
  return d + t * Math.hypot(p[j * 3]! - p[segment * 3]!, p[j * 3 + 1]! - p[segment * 3 + 1]!, p[j * 3 + 2]! - p[segment * 3 + 2]!);
}

// Box around some seams, padded so the surroundings show; part (file) coordinates.
function seamsBox(list: { points: Float32Array }[], diag: number) {
  const min: [number, number, number] = [Infinity, Infinity, Infinity], max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const x of list) for (let i = 0; i < x.points.length; i++) { const k = i % 3, v = x.points[i]!; if (v < min[k]!) min[k] = v; if (v > max[k]!) max[k] = v; }
  const pad = Math.max(diag * 0.04, Math.max(...max.map((v, k) => v - min[k]!)) * 0.35);
  return { min: min.map((v) => v - pad) as [number, number, number], max: max.map((v) => v + pad) as [number, number, number] };
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
  const featureChains = useStore((s) => s.featureChains);
  const xray = useStore((s) => s.xray);
  const section = useStore((s) => s.section);
  const hiddenBodies = useStore((s) => s.hiddenBodies);
  const candidateFilter = useStore((s) => s.candidateFilter);
  const workArea = useStore((s) => s.workArea);

  // Seams step: all tools. Procedures step: click to select a seam only.
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

  // Sequence and Review show the welding order on the part.
  useEffect(() => {
    const c = ctrlRef.current;
    if (!c) return;
    if (step !== "sequence" && step !== "review") { c.setSequence(null); return; }
    c.setSequence(orderedSeams({ seams, sequence }).map((x) => ({ points: x.points, closed: x.closed })));
  }, [step, seams, sequence]);

  const pendingAction = useStore((s) => s.pendingAction);
  const splitCuts = useStore((s) => s.splitCuts);

  // Opening Split zooms to the seam so the preview is easy to see.
  useEffect(() => {
    if (pendingAction !== "split") return;
    const s = useStore.getState();
    const seam = s.seams.find((x) => x.id === s.selectedSeamId);
    const size = s.health?.bounds.size;
    if (seam && size) { const box = seamsBox([seam], Math.hypot(size.x, size.y, size.z)); ctrlRef.current?.fitBox(box.min, box.max); }
  }, [pendingAction]);

  // Live split preview from the cut positions (mm from the start).
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

  // Hidden bodies are dropped; in focus mode the focused bodies stay solid and the rest is a ghost.
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
  const [undoVisible, setUndoVisible] = useState(false);
  useEffect(() => {
    if (!undo) { setUndoVisible(false); return; }
    setUndoVisible(true);
    // Pulse what just changed: new seams (split pieces, merge result) or the reversed seam.
    const before = new Set(undo.state.seams.map((x) => x.id));
    const now = useStore.getState();
    const changed = now.seams.filter((x) => x.status === "accepted" && !before.has(x.id)).map((x) => x.id);
    const ids = changed.length ? changed : now.selectedSeamId ? [now.selectedSeamId] : [];
    const list = now.seams.filter((x) => ids.includes(x.id));
    const size = now.health?.bounds.size;
    // Zoom to what changed so a small seam's edit is visible, then pulse and label it.
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

  // Draw snaps to seam ends first, so a drawn seam joins existing ones end to end.
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
      if (isTyping(e.target) || !seamTools) return;
      const s = useStore.getState();
      if (activeTool === "draw") {
        if (e.key === "Enter") { e.preventDefault(); finishDraft(); }
        else if (e.key === "Backspace") { e.preventDefault(); setDraft((d) => d.slice(0, -1)); }
        else if (e.key === "Escape") { setDraft([]); ctrlRef.current?.setSeamPreview(null); ctrlRef.current?.setSnapMarker(null); }
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z" && s.undo) { e.preventDefault(); s.undoLast(); return; }
      if (e.key === "Escape") { if (s.pendingAction) s.setPendingAction(null); else if (s.selectedSeamId) s.selectSeam(null); else if (s.focus) s.setFocus(null); }
      if (e.key === "Enter" && s.pendingAction === "split" && s.selectedSeamId) { e.preventDefault(); s.splitSeamAt(s.selectedSeamId, s.splitCuts ?? []); return; }
      if ((e.key === "Delete" || e.key === "Backspace") && s.selectedSeamId && s.step === "seams") { e.preventDefault(); s.deleteSeam(s.selectedSeamId); }
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
      const s = useStore.getState();
      const selected = s.pendingAction === "split" ? s.seams.find((x) => x.id === s.selectedSeamId) : undefined;
      if (activeTool === "select" && selected) {
        // One cut follows the cursor along the seam; equal parts ignore the cursor.
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
        if (!hit) { setNotice("Click on the orange seam, or use the slider in the panel."); return; }
        s.setSplitCuts([distanceAlong(selected, hit.segment, hit.t) * MM_PER_UNIT[s.frame.units]]);
      }
      const ids = useStore.getState().splitSeamAt(selected.id, useStore.getState().splitCuts ?? []);
      const after = useStore.getState();
      const parts = after.seams.filter((x) => ids.includes(x.id));
      if (parts.length > 1) setNotice(`Cut into ${parts.map((x) => `${x.name} (${seamLengthMm(x, after.frame.units).toFixed(1)} mm)`).join(", ")}.`);
      else if (parts.length === 1) setNotice(`Loop opened: ${parts[0]!.name} now starts and ends at the cut.`);
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
      {undo && undoVisible && (
        <div className="undo-toast" role="status">
          <span>{undo.label}.</span>
          <button type="button" className="btn-link" onClick={() => { useStore.getState().undoLast(); setUndoVisible(false); }}>Undo</button>
          <span className="undo-key">Ctrl/⌘ Z</span>
        </div>
      )}
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
