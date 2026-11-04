import { create } from "zustand";
import type { Health } from "../domain/mesh/health";
import { hasIssues } from "../domain/mesh/describe";
import { guessUnits } from "../domain/mesh/units";
import type { Units } from "../domain/mesh/units";

export type { Units };

export type Phase = "empty" | "analysing" | "checked" | "repairing" | "error";
export type Verdict = "pass" | "issues";
export type Step = "part" | "seams" | "procedures" | "sequence" | "review";
export type StageId = "read" | "weld" | "topology" | "measure";
export type StageStatus = "pending" | "active" | "done" | "warning" | "error";
export type Tool = "select" | "draw";
export type Projection = "perspective" | "orthographic";
export type ViewId = "iso" | "top" | "bottom" | "front" | "back" | "left" | "right";

export type UpAxis = "+z" | "+y";

type Frame = { units: Units; unitsGuessed: boolean; unitsNote: string | null; upAxis: UpAxis; upGuessed: boolean; confirmed: boolean };

type MeshData = { positions: Float32Array; indices: Uint32Array; health: Health } | null;

type Store = {
  phase: Phase;
  verdict: Verdict | null;
  repaired: boolean;
  repairedBinary: ArrayBuffer | null;
  step: Step;
  fileName: string | null;
  error: string | null;
  health: Health | null;
  originalHealth: Health | null;
  mesh: MeshData;
  originalMesh: MeshData;
  originalBuffer: ArrayBuffer | null;
  originalFile: File | null;
  stages: Record<StageId, StageStatus>;
  repairStages: Record<string, StageStatus>;
  progress: number;
  tool: Tool;
  projection: Projection;
  wireframe: boolean;
  viewMode: "solid" | "wireframe" | "triangles";
  view: ViewId;
  frame: Frame;
  generation: number;
  setPhase: (p: Phase) => void;
  setVerdict: (v: Verdict | null) => void;
  setHealth: (h: Health | null, mesh: MeshData) => void;
  setError: (e: string | null) => void;
  setFileName: (n: string | null) => void;
  setStage: (id: StageId, s: StageStatus) => void;
  resetStages: () => void;
  setStep: (s: Step) => void;
  setTool: (t: Tool) => void;
  setProjection: (p: Projection) => void;
  toggleWireframe: () => void;
  setWireframe: (v: boolean) => void;
  setView: (v: ViewId) => void;
  resetView: () => void;
  setProgress: (v: number) => void;
  setUnits: (u: Units) => void;
  setUpAxis: (a: UpAxis) => void;
  confirmFrame: () => void;
  setViewMode: (m: "solid" | "wireframe" | "triangles") => void;
  startAnalysing: (name: string, buffer: ArrayBuffer) => void;
  startAnalysingFile: (name: string, file: File) => void;
  finishChecked: (health: Health, mesh: MeshData, repaired: boolean, generation: number, binary?: ArrayBuffer | null) => void;
  setRepairedBinary: (b: ArrayBuffer | null) => void;
  undoRepair: () => void;
  loadAnother: () => void;
};

const initialStages: Record<StageId, StageStatus> = { read: "pending", weld: "pending", topology: "pending", measure: "pending" };

const initialFrame: Frame = { units: "mm", unitsGuessed: false, unitsNote: null, upAxis: "+z", upGuessed: false, confirmed: false };

const clearedPart = { health: null, mesh: null, originalHealth: null, originalMesh: null, repaired: false, repairedBinary: null, verdict: null, error: null, progress: 0, stages: { ...initialStages } };

export const useStore = create<Store>((set) => ({
  phase: "empty",
  verdict: null,
  repaired: false,
  repairedBinary: null,
  step: "part",
  fileName: null,
  error: null,
  health: null,
  originalHealth: null,
  mesh: null,
  originalMesh: null,
  originalBuffer: null,
  originalFile: null,
  stages: { ...initialStages },
  repairStages: {},
  progress: 0,
  tool: "select",
  projection: "perspective",
  wireframe: false,
  viewMode: "solid" as const,
  view: "iso",
  frame: { ...initialFrame },
  generation: 0,
  setPhase: (phase) => set({ phase }),
  setVerdict: (verdict) => set({ verdict }),
  setHealth: (health, mesh) => set({ health, mesh }),
  setError: (error) => set({ error }),
  setFileName: (fileName) => set({ fileName }),
  setStage: (id, status) => set((s) => ({ stages: { ...s.stages, [id]: status } })),
  resetStages: () => set({ stages: { ...initialStages } }),
  setStep: (step) => set({ step }),
  setTool: (tool) => set({ tool }),
  setProjection: (projection) => set({ projection }),
  toggleWireframe: () => set((s) => ({ wireframe: !s.wireframe, viewMode: !s.wireframe ? "wireframe" : "solid" })),
  setWireframe: (wireframe) => set({ wireframe, viewMode: wireframe ? "wireframe" : "solid" }),
  setViewMode: (viewMode) => set({ viewMode, wireframe: viewMode === "wireframe" }),
  setView: (view) => set({ view }),
  resetView: () => set({ view: "iso" }),
  setProgress: (progress) => set({ progress }),
  setUnits: (units) => set((s) => ({ frame: { ...s.frame, units, unitsGuessed: false, unitsNote: null } })),
  setUpAxis: (upAxis) => set((s) => ({ frame: { ...s.frame, upAxis, upGuessed: false } })),
  confirmFrame: () => set((s) => ({ frame: { ...s.frame, confirmed: true } })),
  startAnalysing: (fileName, buffer) => set((s) => ({ ...clearedPart, phase: "analysing", fileName, originalBuffer: buffer, originalFile: null, generation: s.generation + 1, frame: { ...initialFrame }, step: "part" })),
  startAnalysingFile: (fileName, file) => set((s) => ({ ...clearedPart, phase: "analysing", fileName, originalFile: file, originalBuffer: null, generation: s.generation + 1, frame: { ...initialFrame }, step: "part" })),
  finishChecked: (health, mesh, repaired, generation, binary) => set((s) => {
    if (generation !== s.generation) return {};
    if (!health || typeof health.triangles !== "number" || !health.bounds) {
      return { phase: "error", error: "Invalid health data from server", stages: { read: "error", weld: "pending", topology: "pending", measure: "pending" } };
    }
    const verdict: Verdict = hasIssues(health) ? "issues" : "pass";
    const stagesDone: Record<StageId, StageStatus> = { read: "done", weld: "done", topology: "done", measure: "done" };
    let frame = s.frame;
    if (!frame.confirmed) {
      const size = health.bounds.size;
      const guess = guessUnits(size, s.fileName);
      const upAxis: UpAxis = size.y > size.z * 2 ? "+y" : "+z";
      frame = { units: guess.units, unitsGuessed: true, unitsNote: guess.note, upAxis, upGuessed: true, confirmed: false };
    }
    if (s.phase === "repairing" || repaired) {
      return { phase: "checked", health, mesh, verdict, repaired: true, stages: stagesDone, originalHealth: s.originalHealth ?? s.health, originalMesh: s.originalMesh ?? s.mesh, progress: 100, frame, repairedBinary: binary ?? s.repairedBinary ?? null };
    }
    return { phase: "checked", health, mesh, verdict, stages: stagesDone, progress: 100, frame, repairedBinary: null };
  }),
  setRepairedBinary: (repairedBinary) => set({ repairedBinary }),
  undoRepair: () => set((s) => {
    if (!s.originalMesh || !s.originalHealth) return {};
    return { mesh: s.originalMesh, health: s.originalHealth, originalMesh: null, originalHealth: null, repaired: false, repairedBinary: null, verdict: hasIssues(s.originalHealth) ? "issues" : "pass" };
  }),
  loadAnother: () => set((s) => ({ ...clearedPart, phase: "empty", fileName: null, originalBuffer: null, originalFile: null, frame: { ...initialFrame }, step: "part", generation: s.generation + 1 })),
}));
