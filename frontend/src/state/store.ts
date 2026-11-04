import { create } from "zustand";
import { EXAMPLE_PROCEDURES, MM_PER_UNIT, compileWeldJob, defaultWeld, evaluateSeam, measure, planOrder, procedureSchema, guessUnits, guessUpAxis, joinPaths, partSizeMm, reversePath, samePath, seamId, splitAtDistances, splitPath } from "@weld/core";
import type { JobInput, Procedure, SeamEvaluation, SeamWeld, WeldJob } from "@weld/core";
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

export type Seam = SeamCandidate & { status: "candidate" | "accepted"; name: string; weld?: SeamWeld };
export type { SeamWeld };
export type SeamCalc = SeamEvaluation;

export type JobSettings = { name: string; notes: string; status: "draft" | "approved"; airSpeedMmS: number; waypointSpacingMm: number; supervision: "operator_confirm" | "auto" };

export const DEFAULT_JOB: JobSettings = { name: "", notes: "", status: "draft", airSpeedMmS: 150, waypointSpacingMm: 5, supervision: "operator_confirm" };

// Accepted seams in welding order: the saved sequence first, any newer seams after it.
export function orderedSeams(s: Pick<Store, "seams" | "sequence">): Seam[] {
  const accepted = s.seams.filter((x) => x.status === "accepted");
  const byId = new Map(accepted.map((x) => [x.id, x]));
  const ordered = s.sequence.map((id) => byId.get(id)).filter((x): x is Seam => !!x);
  const seen = new Set(ordered.map((x) => x.id));
  return [...ordered, ...accepted.filter((x) => !seen.has(x.id))];
}

// Everything the export needs, from the current state.
export function jobInput(s: Store): JobInput {
  const b = s.health?.bounds;
  return {
    meta: { name: s.job.name || (s.part?.fileName.replace(/\.stl$/i, "") ?? "Weld job"), notes: s.job.notes, status: s.job.status },
    part: { filename: s.part?.fileName ?? "part.stl", sha256: s.part?.sha256 ?? null, triangles: s.health?.triangles ?? 0, min: b ? [b.min.x, b.min.y, b.min.z] : [0, 0, 0], max: b ? [b.max.x, b.max.y, b.max.z] : [0, 0, 0], repaired: s.repaired },
    units: s.frame.units, upAxis: s.frame.upAxis, procedures: s.procedures,
    seams: orderedSeams(s).map((x) => ({ ...x, waitAfterS: s.waits[x.id] ?? 0 })),
    airSpeedMmS: s.job.airSpeedMmS, waypointSpacingMm: s.job.waypointSpacingMm, supervision: s.job.supervision,
  };
}

export function previewJob(s: Store) {
  return compileWeldJob(jobInput(s));
}

// Everything the Procedures step shows for one seam: effective values, derived numbers, warnings.
export function seamCalc(seam: Seam, procedures: Procedure[], units: Units, upAxis: UpAxis): SeamCalc | null {
  return evaluateSeam(seam, procedures, units, upAxis);
}

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

type WorkState = Pick<Store, "procedures" | "sequence" | "waits" | "job" | "step" | "verdict" | "health" | "mesh" | "originalMesh" | "repaired" | "repairStats" | "repairedBinary" | "frame" | "seams" | "rejectedIds" | "featureChains" | "detectSettings" | "detection" | "hiddenBodies" | "candidateFilter">;

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

export type Store = {
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
  panelCollapsed: boolean;
  frame: Frame;
  generation: number;

  seams: Seam[];
  rejectedIds: string[];
  selectedSeamId: string | null;
  hoverSeamId: string | null;
  featureChains: SeamPath[];
  detectSettings: DetectSettings;
  detection: Detection;
  pendingAction: PendingAction;
  xray: boolean;
  section: Section | null;
  workArea: WorkArea | null;
  procedures: Procedure[];
  // While Split is on: cut positions in mm from the seam start, previewed live.
  splitCuts: number[] | null;
  // Focus mode: these bodies stay solid, the rest is ghosted, and the camera frames box (part coords).
  focus: { bodies: number[]; label: string; box: { min: [number, number, number]; max: [number, number, number] } } | null;
  // The last seam edit, so it can be undone from the toast.
  // Ask the viewport to frame these seams (used by review-one-by-one).
  cameraTarget: { ids: string[]; at: number } | null;
  reviewing: boolean;
  saveStatus: "idle" | "saving" | "saved" | "error";
  savedAt: number | null;
  undo: { label: string; at: number; state: Pick<Store, "seams" | "sequence" | "waits" | "rejectedIds" | "selectedSeamId"> } | null;
  redo: { label: string; at: number; state: Pick<Store, "seams" | "sequence" | "waits" | "rejectedIds" | "selectedSeamId"> } | null;
  sequence: string[];
  waits: Record<string, number>;
  job: JobSettings;
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
  setPanelCollapsed: (v: boolean) => void;
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
  setHoverSeam: (id: string | null) => void;
  renameSeam: (id: string, name: string) => void;
  reverseSeam: (id: string) => void;
  deleteSeam: (id: string) => void;
  splitSeam: (id: string, segment: number, t: number) => void;
  splitSeamAt: (id: string, distancesMm: number[]) => string[];
  setSplitCuts: (cutsMm: number[] | null) => void;
  setFocus: (focus: Store["focus"]) => void;
  frameSeams: (ids: string[]) => void;
  setReviewing: (on: boolean) => void;
  restoreCandidate: (seam: Seam) => void;
  undoLast: () => void;
  redoLast: () => void;
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
  saveProcedure: (procedure: Procedure) => void;
  duplicateProcedure: (id: string) => string;
  deleteProcedure: (id: string) => string | null;
  assignProcedure: (seamIds: string[], procedureId: string) => void;
  resetProcedures: () => void;
  moveInSequence: (id: string, toIndex: number) => void;
  autoOrder: () => number;
  setWait: (id: string, seconds: number) => void;
  setJob: (patch: Partial<JobSettings>) => void;
  importJob: (job: WeldJob) => string;
  updateWeld: (seamIds: string[], patch: Partial<SeamWeld>) => void;
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
  hoverSeamId: null as string | null,
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
  sequence: [] as string[],
  waits: {} as Record<string, number>,
  job: { ...DEFAULT_JOB },
});

function remember(s: Store, label: string): Pick<Store, "undo" | "redo"> {
  return { undo: { label, at: Date.now(), state: { seams: s.seams, sequence: s.sequence, waits: s.waits, rejectedIds: s.rejectedIds, selectedSeamId: s.selectedSeamId } }, redo: null };
}

function snapshot(s: Store): WorkState {
  return {
    step: s.step, verdict: s.verdict, health: s.health, mesh: s.mesh, originalMesh: s.originalMesh, repaired: s.repaired,
    repairStats: s.repairStats, repairedBinary: s.repairedBinary, frame: s.frame, seams: s.seams, rejectedIds: s.rejectedIds,
    featureChains: s.featureChains, detectSettings: s.detectSettings, detection: { ...s.detection, status: s.detection.status === "running" ? "idle" : s.detection.status },
    hiddenBodies: s.hiddenBodies, candidateFilter: s.candidateFilter, procedures: s.procedures,
    sequence: s.sequence, waits: s.waits, job: s.job,
  };
}

const transient = { focus: null, undo: null, redo: null, reviewing: false, phase: "checked" as Phase, selectedSeamId: null, pendingAction: null as PendingAction, splitCuts: null, error: null, section: null, workArea: null, xray: false };

// The procedure library is the user's own data: kept in the browser across reloads and parts.
const PROCEDURES_KEY = "weld.procedures.v1";

function loadProcedures(): Procedure[] {
  try {
    const saved = typeof localStorage === "undefined" ? null : localStorage.getItem(PROCEDURES_KEY);
    const parsed = saved ? (JSON.parse(saved) as unknown[]) : null;
    if (Array.isArray(parsed) && parsed.length && parsed.every((p) => procedureSchema.safeParse(p).success)) return parsed as Procedure[];
  } catch { /* fall back to the examples */ }
  return structuredClone(EXAMPLE_PROCEDURES);
}

export const useStore = create<Store>((set, get) => ({
  phase: "empty",
  ...clearedPart(),
  tool: "select",
  projection: "perspective",
  panelCollapsed: false,
  viewMode: "solid",
  view: "iso",
  generation: 0,
  cameraTarget: null,
  reviewing: false,
  saveStatus: "idle",
  savedAt: null,
  focus: null,
  undo: null,
  redo: null,
  hoverSeamId: null,
  splitCuts: null,
  procedures: loadProcedures(),
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

  // Moving past the Part step accepts the units and up axis shown (they can still be changed later).
  setStep: (step) => set((s) => ({ step, frame: step !== "part" && !s.frame.confirmed ? { ...s.frame, confirmed: true } : s.frame, pendingAction: null, splitCuts: null })),
  setTool: (tool) => set({ tool }),
  setPanelCollapsed: (panelCollapsed) => set({ panelCollapsed }),
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
    return { ...remember(s, `Accepted ${wanted.size}`), seams };
  }),

  rejectSeams: (ids) => set((s) => {
    const gone = new Set(ids);
    return {
      ...remember(s, `Rejected ${gone.size}`),
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
    set((s) => ({ ...remember(s, `Added ${seam.name}`), seams: [...s.seams.filter((x) => x.id !== seam.id && !(x.status === "candidate" && duplicates(x, seam))), seam], selectedSeamId: seam.id }));
    return seam.id;
  },

  selectSeam: (selectedSeamId) => set({ selectedSeamId, pendingAction: null, splitCuts: null }),
  setHoverSeam: (hoverSeamId) => set({ hoverSeamId }),

  renameSeam: (id, name) => set((s) => ({ seams: s.seams.map((x) => (x.id === id ? { ...x, name } : x)) })),

  reverseSeam: (id) => set((s) => ({ ...remember(s, `Reversed ${s.seams.find((x) => x.id === id)?.name ?? "seam"}`), seams: s.seams.map((x) => (x.id === id ? { ...x, ...reversePath(x) } : x)) })),

  setFocus: (focus) => set({ focus }),
  frameSeams: (ids) => set({ cameraTarget: { ids, at: Date.now() } }),
  setReviewing: (reviewing) => set({ reviewing }),
  // Brings a dropped suggestion back as a candidate (review "Previous" after a drop).
  restoreCandidate: (seam) => set((s) => (s.seams.some((x) => x.id === seam.id) ? {} : {
    seams: [...s.seams, { ...seam, status: "candidate", name: "" }],
    rejectedIds: s.rejectedIds.filter((x) => x !== seam.id),
  })),
  undoLast: () => set((s) => {
    if (!s.undo) return {};
    const redo = { label: s.undo.label, at: Date.now(), state: { seams: s.seams, sequence: s.sequence, waits: s.waits, rejectedIds: s.rejectedIds, selectedSeamId: s.selectedSeamId } };
    return { ...s.undo.state, undo: null, redo, pendingAction: null, splitCuts: null };
  }),
  redoLast: () => set((s) => {
    if (!s.redo) return {};
    const undo = { label: s.redo.label, at: Date.now(), state: { seams: s.seams, sequence: s.sequence, waits: s.waits, rejectedIds: s.rejectedIds, selectedSeamId: s.selectedSeamId } };
    return { ...s.redo.state, redo: null, undo, pendingAction: null, splitCuts: null };
  }),

  deleteSeam: (id) => set((s) => ({
    ...remember(s, `Deleted ${s.seams.find((x) => x.id === id)?.name || "candidate"}`),
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
    return { ...remember(s, `Split ${seam.name}`), seams: [...rest, ...parts], selectedSeamId: parts[0]!.id, pendingAction: null };
  }),

  mergeSeams: (id, otherId) => {
    const s = get();
    const a = s.seams.find((x) => x.id === id), b = s.seams.find((x) => x.id === otherId);
    if (!a || !b || a === b) return "Pick a different seam to merge with.";
    if (b.status !== "accepted") return "Accept that candidate first, then merge.";
    const joined = joinPaths(a, b, joinTolerance(a, b));
    if (!joined) return `${b.name || "That seam"} doesn't touch an end of ${a.name}, so they can't be joined.`;
    const merged: Seam = { ...a, ...joined, id: seamId(a.source, joined), status: "accepted" };
    set({ ...remember(s, `Merged ${a.name} and ${b.name}`), seams: [...s.seams.filter((x) => x.id !== id && x.id !== otherId), merged], selectedSeamId: merged.id, pendingAction: null });
    return null;
  },

  setPendingAction: (pendingAction) => set((s) => {
    const seam = s.seams.find((x) => x.id === s.selectedSeamId);
    return { pendingAction, splitCuts: pendingAction === "split" && seam ? [Math.round(seamLengthMm(seam, s.frame.units) * 5) / 10] : null };
  }),
  setSplitCuts: (splitCuts) => set({ splitCuts }),

  splitSeamAt: (id, distancesMm) => {
    const s = get();
    const seam = s.seams.find((x) => x.id === id);
    if (!seam) return [];
    const scale = MM_PER_UNIT[s.frame.units];
    const paths = splitAtDistances(seam, distancesMm.map((d) => d / scale));
    if (paths.length === 1 && !seam.closed) return [];
    const rest = s.seams.filter((x) => x.id !== id);
    const parts: Seam[] = [];
    for (const path of paths) parts.push({ ...seam, ...path, id: seamId(seam.source, path), name: parts.length === 0 ? seam.name : nextName([...rest, ...parts, seam]) });
    set({ ...remember(s, `Split ${seam.name} into ${parts.length}`), seams: [...rest, ...parts], selectedSeamId: parts[0]!.id, pendingAction: null, splitCuts: null });
    return parts.map((x) => x.id);
  },
  setXray: (xray) => set({ xray }),
  setSection: (section) => set(section ? { section } : { section, workArea: null }),
  setWorkArea: (workArea) => set({ workArea }),
  setCandidateFilter: (patch) => set((s) => ({ candidateFilter: { ...s.candidateFilter, ...patch } })),
  saveCheckpoint: () => set((s) => ({ checkpoint: { savedAt: Date.now(), state: snapshot(s) } })),
  restoreCheckpoint: () => set((s) => (s.checkpoint ? { ...s.checkpoint.state, ...transient } : {})),
  resetToInitial: () => set((s) => (s.initial ? { ...s.initial, ...transient } : {})),
  saveProcedure: (procedure) => set((s) => ({ procedures: s.procedures.some((p) => p.id === procedure.id) ? s.procedures.map((p) => (p.id === procedure.id ? procedure : p)) : [...s.procedures, procedure] })),

  duplicateProcedure: (id) => {
    const source = get().procedures.find((p) => p.id === id);
    if (!source) return id;
    const copy: Procedure = { ...structuredClone(source), id: `proc_${Date.now().toString(36)}`, name: `${source.name.replace(/^EXAMPLE /, "")} (copy)` };
    set((s) => ({ procedures: [...s.procedures, copy] }));
    return copy.id;
  },

  deleteProcedure: (id) => {
    const used = get().seams.filter((x) => x.weld?.procedureId === id).length;
    if (used) return `Used by ${used} seam${used === 1 ? "" : "s"}. Assign them another procedure first.`;
    set((s) => ({ procedures: s.procedures.filter((p) => p.id !== id) }));
    return null;
  },

  assignProcedure: (seamIds, procedureId) => set((s) => {
    const ids = new Set(seamIds);
    const procedure = s.procedures.find((p) => p.id === procedureId);
    if (!procedure) return {};
    return { seams: s.seams.map((x) => (ids.has(x.id) && x.status === "accepted" ? { ...x, weld: x.weld ? { ...x.weld, procedureId, overrides: {} } : defaultWeld(procedure) } : x)) };
  }),

  moveInSequence: (id, toIndex) => set((s) => {
    const ids = orderedSeams(s).map((x) => x.id).filter((x) => x !== id);
    ids.splice(Math.max(0, Math.min(ids.length, toIndex)), 0, id);
    return { sequence: ids };
  }),

  // Reorders and flips seams to cut air travel. Returns the mm of air travel saved.
  autoOrder: () => {
    const s = get();
    const list = orderedSeams(s);
    const ends = list.map((x) => {
      const n = x.points.length / 3;
      const p = (i: number): [number, number, number] => [x.points[i * 3]!, x.points[i * 3 + 1]!, x.points[i * 3 + 2]!];
      return { start: p(0), end: x.closed ? p(0) : p(n - 1), closed: x.closed };
    });
    const before = ends.reduce((t, e, i) => (i === 0 ? 0 : t + Math.hypot(...([0, 1, 2].map((k) => e.start[k]! - ends[i - 1]!.end[k]!) as [number, number, number]))), 0);
    const plan = planOrder(ends);
    const flip = new Set(plan.order.filter((i) => plan.reversed[i]).map((i) => list[i]!.id));
    set({
      sequence: plan.order.map((i) => list[i]!.id),
      seams: s.seams.map((x) => (flip.has(x.id) && !x.closed ? { ...x, ...reversePath(x) } : x)),
    });
    return (before - plan.airMm) * MM_PER_UNIT[s.frame.units];
  },

  setWait: (id, seconds) => set((s) => ({ waits: { ...s.waits, [id]: Math.max(0, seconds) } })),
  setJob: (patch) => set((s) => ({ job: { ...s.job, ...patch } })),

  // Brings an exported job back onto the same part: seams, settings, order and procedures.
  importJob: (job) => {
    const s = get();
    if (!s.mesh) return "Load the part first.";
    if (job.part.sha256 && s.part?.sha256 && job.part.sha256 !== s.part.sha256) return `This job was made for ${job.part.filename}, a different file.`;
    const scale = job.frame.part_to_job.scale_to_mm;
    const up = job.frame.part_to_job.rotation_quaternion_xyzw[0] !== 0 ? "+y" : "+z";
    const back = (v: number[], isPoint: boolean): number[] => {
      const p = isPoint ? v.map((x) => x / scale) : v;
      return up === "+y" ? [p[0]!, p[2]!, -p[1]!] : [p[0]!, p[1]!, p[2]!];
    };
    const seams: Seam[] = job.seams.map((js) => {
      const w = js.geometry.waypoints;
      const path = measure({
        points: new Float32Array(w.flatMap((p) => back(p.position_mm, true))),
        normalsA: new Float32Array(w.flatMap((p) => back(p.surface_normals[0], false))),
        normalsB: new Float32Array(w.flatMap((p) => back(p.surface_normals[1], false))),
        closed: false, length: 0,
      });
      return {
        ...path, id: js.id, name: js.name, status: "accepted", source: "drawn", jointType: js.joint.type, angleDeg: js.joint.dihedral_deg, confidence: 1, reason: "Imported",
        weld: {
          procedureId: js.procedure_ref, overrides: { ...js.overrides }, size: { basis: js.weld_size.basis, value_mm: js.weld_size.value_mm }, passes: js.weld_size.passes,
          intermittent: js.intermittent, torch: { work_angle_offset_deg: js.torch.work_angle_offset_deg, travel_angle_deg: js.torch.travel_angle_deg, stick_out_mm: js.torch.stick_out_mm },
          start: { ...js.start }, end: { ...js.end }, position: js.weld_position.source === "user" ? js.weld_position.iso_6947 : null,
        },
      };
    });
    const procedures = [...s.procedures.filter((p) => !job.procedures.some((j) => j.id === p.id)), ...job.procedures];
    set({
      seams: [...s.seams.filter((x) => x.status === "candidate"), ...seams], procedures, sequence: seams.map((x) => x.id),
      waits: Object.fromEntries(job.seams.map((x) => [x.id, x.wait_after_s])),
      job: { ...s.job, name: job.job.name, notes: job.job.notes, status: job.job.status, airSpeedMmS: job.job.execution.air_speed_mm_s, waypointSpacingMm: job.job.execution.waypoint_spacing_mm, supervision: job.job.execution.default_supervision },
      selectedSeamId: null,
    });
    return `Imported ${seams.length} seam${seams.length === 1 ? "" : "s"} from ${job.job.name}.`;
  },

  resetProcedures: () => {
    const used = new Set(get().seams.map((x) => x.weld?.procedureId).filter(Boolean));
    const kept = get().procedures.filter((p) => used.has(p.id) && !EXAMPLE_PROCEDURES.some((e) => e.id === p.id));
    set({ procedures: [...structuredClone(EXAMPLE_PROCEDURES), ...kept] });
  },

  updateWeld: (seamIds, patch) => set((s) => {
    const ids = new Set(seamIds);
    return { seams: s.seams.map((x) => (ids.has(x.id) && x.weld ? { ...x, weld: { ...x.weld, ...patch } } : x)) };
  }),

  toggleBody: (body) => set((s) => ({ hiddenBodies: s.hiddenBodies.includes(body) ? s.hiddenBodies.filter((b) => b !== body) : [...s.hiddenBodies, body] })),
  isolateBody: (body) => set((s) => ({ hiddenBodies: Array.from({ length: s.health?.bodies ?? 0 }, (_, i) => i).filter((i) => i !== body) })),
  showAllBodies: () => set({ hiddenBodies: [] }),
}));

if (typeof localStorage !== "undefined") {
  let last = useStore.getState().procedures;
  useStore.subscribe((s) => {
    if (s.procedures === last) return;
    last = s.procedures;
    try { localStorage.setItem(PROCEDURES_KEY, JSON.stringify(s.procedures)); } catch { /* storage full or blocked */ }
  });
}
