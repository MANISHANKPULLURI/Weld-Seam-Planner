import { create } from "zustand";
import { guessUnits, guessUpAxis } from "@weld/core";
import type { Health, MeshStage, RepairStats, StlFormat, Units, UpAxis } from "@weld/core";
import { hasIssues } from "../domain/mesh/describe";

export type { Units, UpAxis };

export type Phase = "empty" | "analysing" | "checked" | "repairing" | "error";
export type Verdict = "pass" | "issues";
export type Step = "part" | "seams" | "procedures" | "sequence" | "review";
export type StageId = MeshStage;
export type StageStatus = "pending" | "active" | "done" | "error";
export type Tool = "select" | "draw";
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
});

export const useStore = create<Store>((set, get) => ({
  phase: "empty",
  ...clearedPart(),
  tool: "select",
  projection: "perspective",
  viewMode: "solid",
  view: "iso",
  generation: 0,

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
}));
