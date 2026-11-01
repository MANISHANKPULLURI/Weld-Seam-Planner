import { create } from "zustand";
import type { Health } from "../domain/mesh/health";

export type Phase = "empty" | "analysing" | "checked" | "repairing" | "error";
export type Verdict = "pass" | "issues";
export type Step = "part" | "seams" | "procedures" | "sequence" | "review";
export type StageId = "read" | "weld" | "topology" | "measure";
export type StageStatus = "pending" | "active" | "done" | "warning" | "error";
export type Tool = "select" | "draw";
export type Projection = "perspective" | "orthographic";
export type ViewId = "iso" | "top" | "front" | "right";

type MeshData = { positions: Float32Array; indices: Uint32Array; health: Health } | null;

type Store = {
  phase: Phase;
  verdict: Verdict | null;
  repaired: boolean;
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
  view: ViewId;
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
  startAnalysing: (name: string, buffer: ArrayBuffer) => void;
  startAnalysingFile: (name: string, file: File) => void;
  finishChecked: (health: Health, mesh: MeshData, repaired: boolean) => void;
  undoRepair: () => void;
  loadAnother: () => void;
};

const initialStages: Record<StageId, StageStatus> = { read: "pending", weld: "pending", topology: "pending", measure: "pending" };

export const useStore = create<Store>((set) => ({
  phase: "empty",
  verdict: null,
  repaired: false,
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
  view: "iso",
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
  toggleWireframe: () => set((s) => ({ wireframe: !s.wireframe })),
  setWireframe: (wireframe) => set({ wireframe }),
  setView: (view) => set({ view }),
  resetView: () => set({ view: "iso" }),
  setProgress: (progress) => set({ progress }),
  startAnalysing: (fileName, buffer) => set({ phase: "analysing", fileName, originalBuffer: buffer, originalFile: null, error: null, stages: { ...initialStages }, verdict: null, progress: 0 }),
  startAnalysingFile: (fileName, file) => set({ phase: "analysing", fileName, originalFile: file, originalBuffer: null, error: null, stages: { ...initialStages }, verdict: null, progress: 0 }),
  finishChecked: (health, mesh, repaired) => set((s) => {
    const isIssues = health.openEdges > 0 || health.bodies > 1 || health.hasFlippedFaces;
    const verdict: Verdict = isIssues ? "issues" : "pass";
    const stagesDone: Record<StageId, StageStatus> = { read: "done", weld: "done", topology: "done", measure: "done" };
    if (s.phase === "repairing" || repaired) {
      return { phase: "checked", health, mesh, verdict, repaired: true, stages: stagesDone, originalHealth: s.originalHealth ?? s.health, originalMesh: s.originalMesh ?? s.mesh, progress: 100 };
    }
    return { phase: "checked", health, mesh, verdict, stages: stagesDone, progress: 100 };
  }),
  undoRepair: () => set((s) => {
    if (!s.originalMesh || !s.originalHealth) return {};
    return { mesh: s.originalMesh, health: s.originalHealth, repaired: false, verdict: s.originalHealth.openEdges > 0 || s.originalHealth.bodies > 1 ? "issues" : "pass" };
  }),
  loadAnother: () => set({ phase: "empty", verdict: null, repaired: false, fileName: null, error: null, health: null, mesh: null, originalBuffer: null, originalFile: null, stages: { ...initialStages }, progress: 0 }),
}));
