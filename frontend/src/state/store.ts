import { create } from "zustand";
import { MM_PER_UNIT, guessUnits, guessUpAxis, joinPaths, partSizeMm, reversePath, samePath, seamId, splitPath } from "@weld/core";
import type { DetectResult, Health, MeshStage, RepairStats, SeamCandidate, SeamPath, SeamSource, StlFormat, Units, UpAxis } from "@weld/core";
import { hasIssues } from "../domain/mesh/describe";

export type { Units, UpAxis };

export type Phase = "empty" | "analysing" | "checked" | "repairing" | "error";
export type Verdict = "pass" | "issues";
export type Step = "part" | "seams" | "procedures" | "sequence" | "review";
export type StageId = MeshStage;
export type StageStatus = "pending" | "active" | "done" | "error";
export type Tool = "select" | "edge" | "draw";
export type Projection = "perspective" | "orthographic";
export type ViewId = "iso" | "top" | "bottom" | "front" | "back" | "left" | "right";
export type ViewMode = "solid" | "wireframe" | "triangles";

export type PartInfo = {
  fileName: string;
  sizeBytes: number;
  sha256: string | null;
  format: StlFormat | null;
  solids: number;
  warnings: string[];
};

export type MeshData = {
  positions: Float32Array;
  indices: Uint32Array;
  orientedIndices: Uint32Array;
  bodyOfTriangle: Uint32Array;
  health: Health;
};

export type Frame = { units: Units; unitsGuessed: boolean; unitsNote: string | null; upAxis: UpAxis; upGuessed: boolean; confirmed: boolean };

export type AnalysisResult = Omit<MeshData, "positions"> & { vertices: Float32Array; format: StlFormat; solids: number; warnings: string[]; sha256: string | null; sizeBytes: number };

export type RepairResult = { indices: Uint32Array; bodyOfTriangle: Uint32Array; health: Health; stats: RepairStats; binary: ArrayBuffer };

export type Seam = SeamCandidate & { status: "candidate" | "accepted"; name: string };

// minLengthMm null means automatic: 1% of the part's diagonal, at least 5 mm.
export type DetectSettings = { featureAngleDeg: number; minLengthMm: number | null; gapMm: number; includeOutside: boolean };

export type CandidateFilter = { hidden: SeamSource[]; minLengthMm: number };

export type Section = { axis: SectionAxis; offset: number; flipped: boolean };

// A confirmed section: everything (detection, list, picking, drawing) is limited to its kept side.
// plane is in file coordinates; points with normal·p + constant >= 0 are inside.
export type WorkArea = { plane: { normal: [number, number, number]; constant: number }; label: string };

export function inWorkArea(seam: { points: Float32Array }, area: WorkArea | null): boolean {
  if (!area) return true;
  const { normal: n, constant } = area.plane;
  const p = seam.points;
  for (let i = 0; i < p.length; i += 3) if (n[0] * p[i]! + n[1] * p[i + 1]! + n[2] * p[i + 2]! + constant >= 0) return true;
  return false;
}

type WorkState = Pick<Store, "step" | "verdict" | "health" | "mesh" | "originalMesh" | "repaired" | "repairStats" | "repairedBinary" | "frame" | "seams" | "rejectedIds" | "featureChains" | "detectSettings" | "detection" | "hiddenBodies" | "candidateFilter">;

// scope describes the area searched ("inside the section cut"), null for the whole part.
export type Detection = { status: "idle" | "running" | "done" | "error"; error: string | null; run: number; scope?: string | null };

export type SectionAxis = "x" | "y" | "z";

export type PendingAction = "split" | "merge" | null;

export const DEFAULT_DETECT_SETTINGS: DetectSettings = { featureAngleDeg: 45, minLengthMm: null, gapMm: 0.05, includeOutside: false };

export function autoMinLengthMm(health: Health | null, units: Units): number {
  if (!health) return 5;
  const s = partSizeMm(health.bounds.size, units, "+z");
  return Math.max(5, Math.round(Math.hypot(s.x, s.y, s.z) * 0.01));
}

const joinTolerance = (a: Seam, b: Seam) => Math.max(a.length, b.length) * 1e-3;

// Seams that touch the given one end to end, so the two can become one continuous weld.
export function mergeTargets(seams: Seam[], id: string): Seam[] {
  const seam = seams.find((x) => x.id === id);
  if (!seam || seam.closed) return [];
  return seams.filter((x) => x.id !== id && x.status === "accepted" && joinPaths(seam, x, joinTolerance(seam, x)) !== null);
}

const duplicates = (a: Seam, b: Seam) => samePath(a, b, joinTolerance(a, b) * 5);

export function candidateVisible(seam: Seam, filter: CandidateFilter, units: Units): boolean {
  return seam.status === "accepted" || (!filter.hidden.includes(seam.source) && seamLengthMm(seam, units) >= filter.minLengthMm);
}

const JOINT_FOR_SOURCE: Partial<Record<SeamSource, SeamCandidate["jointType"]>> = { edge_chain: "unknown", drawn: "unknown" };

export function seamLengthMm(seam: SeamPath, units: Units): number {
  return seam.length * MM_PER_UNIT[units];
}

function nextName(seams: Seam[]): string {
  let n = 1;
  const taken = new Set(seams.map((s) => s.name));
  while (taken.has(`S${n}`)) n++;
  return `S${n}`;
}

function manualSeam(path: SeamPath, source: SeamSource, seams: Seam[]): Seam {
  return { ...path, id: seamId(source, path), source, jointType: JOINT_FOR_SOURCE[source] ?? "unknown", angleDeg: 0, confidence: 1, reason: source === "drawn" ? "Drawn by hand" : "Picked edge", status: "accepted", name: nextName(seams) };
}

export const STAGE_ORDER: StageId[] = ["read", "weld", "topology", "orient"];
const STAGE_WEIGHT: Record<StageId, number> = { read: 0.35, weld: 0.25, topology: 0.2, orient: 0.2 };

const initialStages = (): Record<StageId, StageStatus> => ({ read: "pending", weld: "pending", topology: "pending", orient: "pending" });
const initialFrame = (): Frame => ({ units: "mm", unitsGuessed: false, unitsNote: null, upAxis: "+z", upGuessed: false, confirmed: false });

type Store = {
  phase: Phase;
  verdict: Verdict | null;
  step: Step;
  error: string | null;
  part: PartInfo | null;
  health: Health | null;
  mesh: MeshData | null;
  originalMesh: MeshData | null;
  repaired: boolean;
  repairStats: RepairStats | null;
  repairedBinary: ArrayBuffer | null;
  stages: Record<StageId, StageStatus>;
  progress: number;
  tool: Tool;
  projection: Projection;
  viewMode: ViewMode;
  view: ViewId;
  frame: Frame;
  generation: number;

  seams: Seam[];
  rejectedIds: string[];
  selectedSeamId: string | null;
  featureChains: SeamPath[];
  detectSettings: DetectSettings;
  detection: Detection;
  pendingAction: PendingAction;
  xray: boolean;
  section: Section | null;
  workArea: WorkArea | null;
  hiddenBodies: number[];
  candidateFilter: CandidateFilter;
  initial: WorkState | null;
  checkpoint: { savedAt: number; state: WorkState } | null;

  startAnalysing: (fileName: string, sizeBytes: number) => number;
  setStageProgress: (generation: number, stage: StageId, fraction: number) => void;
  finishAnalysis: (generation: number, result: AnalysisResult) => void;
  failAnalysis: (generation: number, message: string) => void;
  startRepair: () => number;
  finishRepair: (generation: number, result: RepairResult) => void;
  failRepair: (generation: number, message: string) => void;
  undoRepair: () => void;
  loadAnother: () => void;

  setStep: (s: Step) => void;
  setTool: (t: Tool) => void;
  setProjection: (p: Projection) => void;
  setViewMode: (m: ViewMode) => void;
  setView: (v: ViewId) => void;
  setUnits: (u: Units) => void;
  setUpAxis: (a: UpAxis) => void;
  confirmFrame: () => void;

  setDetectSettings: (patch: Partial<DetectSettings>) => void;
  startDetect: (scope?: string | null) => number;
  finishDetect: (run: number, result: DetectResult) => void;
  failDetect: (run: number, message: string) => void;
  acceptSeams: (ids: string[]) => void;
  rejectSeams: (ids: string[]) => void;
  addSeam: (path: SeamPath, source: SeamSource) => string;
  selectSeam: (id: string | null) => void;
  renameSeam: (id: string, name: string) => void;
  reverseSeam: (id: string) => void;
  deleteSeam: (id: string) => void;
  splitSeam: (id: string, segment: number, t: number) => void;
  mergeSeams: (id: string, otherId: string) => string | null;
  setPendingAction: (action: PendingAction) => void;
  setXray: (on: boolean) => void;
  setSection: (section: Section | null) => void;
  setWorkArea: (workArea: WorkArea | null) => void;
  setCandidateFilter: (patch: Partial<CandidateFilter>) => void;
  saveCheckpoint: () => void;
  restoreCheckpoint: () => void;
  resetToInitial: () => void;
  toggleBody: (body: number) => void;
  isolateBody: (body: number) => void;
  showAllBodies: () => void;
};

const clearedPart = () => ({
  verdict: null,
  error: null,
  part: null,
  health: null,
  mesh: null,
  originalMesh: null,
  repaired: false,
  repairStats: null,
  repairedBinary: null,
  stages: initialStages(),
  progress: 0,
  frame: initialFrame(),
  step: "part" as Step,
  seams: [] as Seam[],
  rejectedIds: [] as string[],
  selectedSeamId: null,
  featureChains: [] as SeamPath[],
  detection: { status: "idle", error: null, run: 0 } as Detection,
  pendingAction: null as PendingAction,
  section: null,
  workArea: null,
  hiddenBodies: [] as number[],
  candidateFilter: { hidden: [], minLengthMm: 0 } as CandidateFilter,
  detectSettings: { ...DEFAULT_DETECT_SETTINGS },
  initial: null,
  checkpoint: null,
});

function snapshot(s: Store): WorkState {
  return {
    step: s.step, verdict: s.verdict, health: s.health, mesh: s.mesh, originalMesh: s.originalMesh, repaired: s.repaired,
    repairStats: s.repairStats, repairedBinary: s.repairedBinary, frame: s.frame, seams: s.seams, rejectedIds: s.rejectedIds,
    featureChains: s.featureChains, detectSettings: s.detectSettings, detection: { ...s.detection, status: s.detection.status === "running" ? "idle" : s.detection.status },
    hiddenBodies: s.hiddenBodies, candidateFilter: s.candidateFilter,
  };
}

const transient = { phase: "checked" as Phase, selectedSeamId: null, pendingAction: null as PendingAction, error: null, section: null, workArea: null, xray: false };

export const useStore = create<Store>((set, get) => ({
  phase: "empty",
  ...clearedPart(),
  tool: "select",
  projection: "perspective",
  viewMode: "solid",
  view: "iso",
  generation: 0,
  xray: false,

  startAnalysing: (fileName, sizeBytes) => {
    const generation = get().generation + 1;
    set({
      ...clearedPart(),
      phase: "analysing",
      generation,
      part: { fileName, sizeBytes, sha256: null, format: null, solids: 0, warnings: [] },
    });
    return generation;
  },

  setStageProgress: (generation, stage, fraction) => set((s) => {
    if (generation !== s.generation || s.phase !== "analysing") return {};
    const stages = { ...s.stages };
    const index = STAGE_ORDER.indexOf(stage);
    let progress = 0;
    STAGE_ORDER.forEach((id, i) => {
      if (i < index) { stages[id] = "done"; progress += STAGE_WEIGHT[id]; }
      else if (i === index) { stages[id] = fraction >= 1 ? "done" : "active"; progress += STAGE_WEIGHT[id] * Math.min(1, fraction); }
    });
    return { stages, progress: Math.round(progress * 100) };
  }),

  finishAnalysis: (generation, result) => set((s) => {
    if (generation !== s.generation) return {};
    const size = result.health.bounds.size;
    const guess = guessUnits(size, s.part?.fileName ?? null);
    const next = {
      phase: "checked",
      progress: 100,
      stages: { read: "done", weld: "done", topology: "done", orient: "done" },
      health: result.health,
      verdict: hasIssues(result.health) ? "issues" : "pass",
      mesh: { positions: result.vertices, indices: result.indices, orientedIndices: result.orientedIndices, bodyOfTriangle: result.bodyOfTriangle, health: result.health },
      part: { fileName: s.part?.fileName ?? "part.stl", sizeBytes: result.sizeBytes, sha256: result.sha256, format: result.format, solids: result.solids, warnings: result.warnings },
      frame: { units: guess.units, unitsGuessed: true, unitsNote: guess.note, upAxis: guessUpAxis(size), upGuessed: true, confirmed: false },
    };
    return { ...next, initial: snapshot({ ...s, ...next } as Store) };
  }),

  failAnalysis: (generation, message) => set((s) => {
    if (generation !== s.generation) return {};
    const stages = { ...s.stages };
    const active = STAGE_ORDER.find((id) => stages[id] !== "done") ?? "read";
    stages[active] = "error";
    return { phase: "error", error: message, stages };
  }),

  startRepair: () => {
    const generation = get().generation + 1;
    set({ phase: "repairing", generation, error: null });
    return generation;
  },

  finishRepair: (generation, result) => set((s) => {
    if (generation !== s.generation || !s.mesh) return {};
    const original = s.originalMesh ?? s.mesh;
    return {
      phase: "checked",
      repaired: true,
      repairStats: result.stats,
      repairedBinary: result.binary,
      originalMesh: original,
      health: result.health,
      verdict: hasIssues(result.health) ? "issues" : "pass",
      mesh: { positions: s.mesh.positions, indices: result.indices, orientedIndices: result.indices, bodyOfTriangle: result.bodyOfTriangle, health: result.health },
    };
  }),

  failRepair: (generation, message) => set((s) => (generation !== s.generation ? {} : { phase: "checked", error: message })),

  undoRepair: () => set((s) => {
    if (!s.originalMesh) return {};
    return {
      mesh: s.originalMesh,
      health: s.originalMesh.health,
      verdict: hasIssues(s.originalMesh.health) ? "issues" : "pass",
      originalMesh: null,
      repaired: false,
      repairStats: null,
      repairedBinary: null,
      error: null,
    };
  }),

  loadAnother: () => set((s) => ({ ...clearedPart(), phase: "empty", generation: s.generation + 1 })),

  setStep: (step) => set({ step }),
  setTool: (tool) => set({ tool }),
  setProjection: (projection) => set({ projection }),
  setViewMode: (viewMode) => set({ viewMode }),
  setView: (view) => set({ view }),
  setUnits: (units) => set((s) => ({ frame: { ...s.frame, units, unitsGuessed: false, unitsNote: null, confirmed: false } })),
  setUpAxis: (upAxis) => set((s) => ({ frame: { ...s.frame, upAxis, upGuessed: false, confirmed: false } })),
  confirmFrame: () => set((s) => ({ frame: { ...s.frame, confirmed: true } })),

  setDetectSettings: (patch) => set((s) => ({ detectSettings: { ...s.detectSettings, ...patch } })),

  startDetect: (scope = null) => {
    const run = get().detection.run + 1;
    set({ detection: { status: "running", error: null, run, scope } });
    return run;
  },

  // Re-running keeps accepted seams and never brings back rejected ones; ids are stable across runs.
  finishDetect: (run, result) => set((s) => {
    if (run !== s.detection.run) return {};
    const accepted = s.seams.filter((x) => x.status === "accepted");
    const skip = new Set([...accepted.map((x) => x.id), ...s.rejectedIds]);
    const candidates: Seam[] = result.candidates
      .filter((c) => !skip.has(c.id))
      .map((c): Seam => ({ ...c, status: "candidate", name: "" }))
      .filter((c) => !accepted.some((a) => duplicates(a, c)));
    const seams = [...accepted, ...candidates];
    return {
      seams,
      featureChains: result.featureChains,
      detection: { ...s.detection, status: "done", error: null },
      selectedSeamId: seams.some((x) => x.id === s.selectedSeamId) ? s.selectedSeamId : null,
    };
  }),

  failDetect: (run, message) => set((s) => (run !== s.detection.run ? {} : { detection: { ...s.detection, status: "error", error: message } })),

  acceptSeams: (ids) => set((s) => {
    const wanted = new Set(ids);
    const seams = [...s.seams];
    seams.forEach((x, i) => {
      if (wanted.has(x.id) && x.status === "candidate") seams[i] = { ...x, status: "accepted", name: nextName(seams) };
    });
    return { seams };
  }),

  rejectSeams: (ids) => set((s) => {
    const gone = new Set(ids);
    return {
      seams: s.seams.filter((x) => !(gone.has(x.id) && x.status === "candidate")),
      rejectedIds: [...s.rejectedIds, ...ids],
      selectedSeamId: s.selectedSeamId && gone.has(s.selectedSeamId) ? null : s.selectedSeamId,
    };
  }),

  addSeam: (path, source) => {
    const seam = manualSeam(path, source, get().seams);
    const existing = get().seams.find((x) => x.status === "accepted" && duplicates(x, seam));
    if (existing) { set({ selectedSeamId: existing.id }); return existing.id; }
    // A candidate on the same line is replaced by the seam the user added.
    set((s) => ({ seams: [...s.seams.filter((x) => x.id !== seam.id && !(x.status === "candidate" && duplicates(x, seam))), seam], selectedSeamId: seam.id }));
    return seam.id;
  },

  selectSeam: (selectedSeamId) => set({ selectedSeamId, pendingAction: null }),

  renameSeam: (id, name) => set((s) => ({ seams: s.seams.map((x) => (x.id === id ? { ...x, name } : x)) })),

  reverseSeam: (id) => set((s) => ({ seams: s.seams.map((x) => (x.id === id ? { ...x, ...reversePath(x) } : x)) })),

  deleteSeam: (id) => set((s) => ({
    seams: s.seams.filter((x) => x.id !== id),
    rejectedIds: [...s.rejectedIds, id],
    selectedSeamId: s.selectedSeamId === id ? null : s.selectedSeamId,
    pendingAction: null,
  })),

  splitSeam: (id, segment, t) => set((s) => {
    const seam = s.seams.find((x) => x.id === id);
    if (!seam) return {};
    const rest = s.seams.filter((x) => x.id !== id);
    const parts: Seam[] = [];
    for (const path of splitPath(seam, segment, t)) {
      parts.push({ ...seam, ...path, id: seamId(seam.source, path), name: parts.length === 0 ? seam.name : nextName([...rest, ...parts, seam]) });
    }
    return { seams: [...rest, ...parts], selectedSeamId: parts[0]!.id, pendingAction: null };
  }),

  mergeSeams: (id, otherId) => {
    const s = get();
    const a = s.seams.find((x) => x.id === id), b = s.seams.find((x) => x.id === otherId);
    if (!a || !b || a === b) return "Pick a different seam to merge with.";
    if (b.status !== "accepted") return "Accept that candidate first, then merge.";
    const joined = joinPaths(a, b, joinTolerance(a, b));
    if (!joined) return `${b.name || "That seam"} doesn't touch an end of ${a.name}, so they can't be joined.`;
    const merged: Seam = { ...a, ...joined, id: seamId(a.source, joined), status: "accepted" };
    set({ seams: [...s.seams.filter((x) => x.id !== id && x.id !== otherId), merged], selectedSeamId: merged.id, pendingAction: null });
    return null;
  },

  setPendingAction: (pendingAction) => set({ pendingAction }),
  setXray: (xray) => set({ xray }),
  setSection: (section) => set(section ? { section } : { section, workArea: null }),
  setWorkArea: (workArea) => set({ workArea }),
  setCandidateFilter: (patch) => set((s) => ({ candidateFilter: { ...s.candidateFilter, ...patch } })),
  saveCheckpoint: () => set((s) => ({ checkpoint: { savedAt: Date.now(), state: snapshot(s) } })),
  restoreCheckpoint: () => set((s) => (s.checkpoint ? { ...s.checkpoint.state, ...transient } : {})),
  resetToInitial: () => set((s) => (s.initial ? { ...s.initial, ...transient } : {})),
  toggleBody: (body) => set((s) => ({ hiddenBodies: s.hiddenBodies.includes(body) ? s.hiddenBodies.filter((b) => b !== body) : [...s.hiddenBodies, body] })),
  isolateBody: (body) => set((s) => ({ hiddenBodies: Array.from({ length: s.health?.bodies ?? 0 }, (_, i) => i).filter((i) => i !== body) })),
  showAllBodies: () => set({ hiddenBodies: [] }),
}));
