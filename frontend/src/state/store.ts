import { create } from "zustand";
import { MM_PER_UNIT, guessUnits, guessUpAxis, joinPaths, reversePath, seamId, splitPath } from "@weld/core";
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

export type DetectSettings = { featureAngleDeg: number; minLengthMm: number; gapMm: number; includeOutside: boolean };

export type Detection = { status: "idle" | "running" | "done" | "error"; error: string | null; run: number };

export type SectionAxis = "x" | "y" | "z";

export type PendingAction = "split" | "merge" | null;

export const DEFAULT_DETECT_SETTINGS: DetectSettings = { featureAngleDeg: 30, minLengthMm: 5, gapMm: 0.05, includeOutside: false };

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
  section: { axis: SectionAxis; offset: number } | null;
  hiddenBodies: number[];

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
  startDetect: () => number;
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
  setSection: (section: { axis: SectionAxis; offset: number } | null) => void;
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
  hiddenBodies: [] as number[],
});

export const useStore = create<Store>((set, get) => ({
  phase: "empty",
  ...clearedPart(),
  tool: "select",
  projection: "perspective",
  viewMode: "solid",
  view: "iso",
  generation: 0,
  detectSettings: { ...DEFAULT_DETECT_SETTINGS },
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
    return {
      phase: "checked",
      progress: 100,
      stages: { read: "done", weld: "done", topology: "done", orient: "done" },
      health: result.health,
      verdict: hasIssues(result.health) ? "issues" : "pass",
      mesh: { positions: result.vertices, indices: result.indices, orientedIndices: result.orientedIndices, bodyOfTriangle: result.bodyOfTriangle, health: result.health },
      part: { fileName: s.part?.fileName ?? "part.stl", sizeBytes: result.sizeBytes, sha256: result.sha256, format: result.format, solids: result.solids, warnings: result.warnings },
      frame: { units: guess.units, unitsGuessed: true, unitsNote: guess.note, upAxis: guessUpAxis(size), upGuessed: true, confirmed: false },
    };
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

  startDetect: () => {
    const run = get().detection.run + 1;
    set({ detection: { status: "running", error: null, run } });
    return run;
  },

  // Re-running keeps accepted seams and never brings back rejected ones; ids are stable across runs.
  finishDetect: (run, result) => set((s) => {
    if (run !== s.detection.run) return {};
    const accepted = s.seams.filter((x) => x.status === "accepted");
    const skip = new Set([...accepted.map((x) => x.id), ...s.rejectedIds]);
    const candidates: Seam[] = result.candidates.filter((c) => !skip.has(c.id)).map((c) => ({ ...c, status: "candidate", name: "" }));
    const seams = [...accepted, ...candidates];
    return {
      seams,
      featureChains: result.featureChains,
      detection: { status: "done", error: null, run },
      selectedSeamId: seams.some((x) => x.id === s.selectedSeamId) ? s.selectedSeamId : null,
    };
  }),

  failDetect: (run, message) => set((s) => (run !== s.detection.run ? {} : { detection: { status: "error", error: message, run } })),

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
    set((s) => ({ seams: [...s.seams.filter((x) => x.id !== seam.id), seam], selectedSeamId: seam.id }));
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
    const tolerance = Math.max(a.length, b.length) * 1e-3;
    const joined = joinPaths(a, b, tolerance);
    if (!joined) return "These seams don't share an end, so they can't be merged.";
    const merged: Seam = { ...a, ...joined, id: seamId(a.source, joined), status: "accepted" };
    set({ seams: [...s.seams.filter((x) => x.id !== id && x.id !== otherId), merged], selectedSeamId: merged.id, pendingAction: null });
    return null;
  },

  setPendingAction: (pendingAction) => set({ pendingAction }),
  setXray: (xray) => set({ xray }),
  setSection: (section) => set({ section }),
  toggleBody: (body) => set((s) => ({ hiddenBodies: s.hiddenBodies.includes(body) ? s.hiddenBodies.filter((b) => b !== body) : [...s.hiddenBodies, body] })),
  isolateBody: (body) => set((s) => ({ hiddenBodies: Array.from({ length: s.health?.bodies ?? 0 }, (_, i) => i).filter((i) => i !== body) })),
  showAllBodies: () => set({ hiddenBodies: [] }),
}));
