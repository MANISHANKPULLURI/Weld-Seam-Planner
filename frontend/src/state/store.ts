import { create } from "zustand";
import type { Health } from "../domain/mesh/health";

export type Phase = "empty" | "analysing" | "checked" | "repairing" | "error";
export type Verdict = "pass" | "issues";
export type Step = "part" | "seams" | "procedures" | "sequence" | "review";
export type StageId = "read" | "weld" | "topology" | "measure";
export type StageStatus = "pending" | "active" | "done" | "warning" | "error";
export type Tool = "select" | "draw";
export type Projection = "perspective" | "orthographic";
export type ViewId = "iso" | "top" | "bottom" | "front" | "back" | "left" | "right";

export type Units = "mm" | "cm" | "m" | "inch";
export type UpAxis = "+z" | "+y";

type MeshData = { positions: Float32Array; indices: Uint32Array; health: Health } | null;

export type InputMode = "single" | "multiple";
export type ProjectUnits = "mm" | "inch";
export type Vec3 = { x: number; y: number; z: number };
export type ComponentTransform = { position: Vec3; rotation: Vec3 };
export type ComponentStatus = "pending" | "uploading" | "validating" | "validated" | "error";
export type ProjectComponent = {
  id: string;
  name: string;
  originalFilename: string;
  triangleCount: number;
  vertexCount: number;
  bounds: { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number }; size: { x: number; y: number; z: number } };
  health: Health;
  units: ProjectUnits;
  status: ComponentStatus;
  error?: string;
  positions: Float32Array;
  indices: Uint32Array;
  material: string;
  materialGrade: string;
  thickness: number | null;
  transform: ComponentTransform;
  visible: boolean;
  locked: boolean;
};

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
  viewMode: "solid" | "wireframe";
  view: ViewId;
  frame: { units: Units; unitsGuessed: boolean; upAxis: UpAxis; upGuessed: boolean; confirmed: boolean };
  generation: number;
  projectId: string | null;
  projectName: string | null;
  inputMode: InputMode | null;
  projectUnits: ProjectUnits | null;
  projectUnitsConfirmed: boolean;
  components: ProjectComponent[];
  assemblyId: string | null;
  selectedComponentId: string | null;
  isolatedComponentId: string | null;
  explodedFactor: number;
  transformMode: "translate" | "rotate";
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
  setViewMode: (m: "solid" | "wireframe") => void;
  startAnalysing: (name: string, buffer: ArrayBuffer) => void;
  startAnalysingFile: (name: string, file: File) => void;
  finishChecked: (health: Health, mesh: MeshData, repaired: boolean, generation: number, binary?: ArrayBuffer | null) => void;
  setRepairedBinary: (b: ArrayBuffer | null) => void;
  undoRepair: () => void;
  loadAnother: () => void;
  createProject: (inputMode: InputMode, units: ProjectUnits, name?: string) => void;
  setProjectUnits: (units: ProjectUnits) => void;
  confirmProjectUnits: () => void;
  addComponent: (c: Partial<ProjectComponent> & { id: string }) => void;
  updateComponent: (id: string, patch: Partial<ProjectComponent>) => void;
  removeComponent: (id: string) => void;
  clearProject: () => void;
  setComponents: (components: Array<Partial<ProjectComponent> & { id: string }>) => void;
  selectComponent: (id: string | null) => void;
  renameComponent: (id: string, name: string) => void;
  setComponentVisibility: (id: string, visible: boolean) => void;
  toggleVisibility: (id: string) => void;
  isolateComponent: (id: string | null) => void;
  toggleLock: (id: string) => void;
  setComponentTransform: (id: string, transform: ComponentTransform) => void;
  resetComponentTransform: (id: string) => void;
  setComponentMaterial: (id: string, material: string, grade: string) => void;
  setComponentThickness: (id: string, thickness: number | null) => void;
  setExplodedFactor: (f: number) => void;
  setTransformMode: (m: "translate" | "rotate") => void;
  fitAssembly: () => void;
  fitSelected: () => void;
};

const initialStages: Record<StageId, StageStatus> = { read: "pending", weld: "pending", topology: "pending", measure: "pending" };

function defaultTransform(): ComponentTransform { return { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 } }; }
function withDefaults(c: Partial<ProjectComponent> & { id: string }): ProjectComponent {
  return {
    id: c.id,
    name: c.name ?? c.id,
    originalFilename: c.originalFilename ?? `${c.id}.stl`,
    triangleCount: c.triangleCount ?? 0,
    vertexCount: c.vertexCount ?? 0,
    bounds: c.bounds ?? { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 }, size: { x: 0, y: 0, z: 0 } },
    health: c.health ?? { triangles: 0, bodies: 0, openEdges: 0, bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 }, size: { x: 0, y: 0, z: 0 } }, hasFlippedFaces: false },
    units: (c.units as ProjectUnits) ?? "mm",
    status: (c.status as ComponentStatus) ?? "validated",
    error: c.error,
    positions: c.positions instanceof Float32Array ? c.positions : new Float32Array(0),
    indices: c.indices instanceof Uint32Array ? c.indices : new Uint32Array(0),
    material: c.material ?? "Steel",
    materialGrade: c.materialGrade ?? "S355",
    thickness: c.thickness ?? null,
    transform: c.transform ?? defaultTransform(),
    visible: c.visible ?? true,
    locked: c.locked ?? false,
  };
}
function persistProject(state: Partial<Store>) {
  try {
    const toSave = {
      projectId: state.projectId,
      projectName: state.projectName,
      inputMode: state.inputMode,
      projectUnits: state.projectUnits,
      projectUnitsConfirmed: state.projectUnitsConfirmed,
      assemblyId: state.assemblyId,
      selectedComponentId: state.selectedComponentId,
      isolatedComponentId: state.isolatedComponentId,
      explodedFactor: state.explodedFactor,
      transformMode: state.transformMode,
      components: (state.components || []).map((c) => ({
        id: c.id,
        name: c.name,
        originalFilename: c.originalFilename,
        triangleCount: c.triangleCount,
        vertexCount: c.vertexCount,
        bounds: c.bounds,
        health: c.health,
        units: c.units,
        status: c.status,
        error: c.error,
        material: c.material,
        materialGrade: c.materialGrade,
        thickness: c.thickness,
        transform: c.transform,
        visible: c.visible,
        locked: c.locked,
      })),
      frame: state.frame,
      step: state.step,
    };
    localStorage.setItem("weldProject", JSON.stringify(toSave));
  } catch {}
}

function loadPersistedProject(): Partial<Store> | null {
  try {
    const raw = localStorage.getItem("weldProject");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed.components && Array.isArray(parsed.components)) {
      parsed.components = parsed.components.map((c: Partial<ProjectComponent>) => withDefaults({ ...c, id: (c as { id: string }).id } as Partial<ProjectComponent> & { id: string }));
      for (const comp of parsed.components as ProjectComponent[]) { comp.positions = new Float32Array(0); comp.indices = new Uint32Array(0); }
    }
    return parsed;
  } catch { return null; }
}

const persisted = typeof window !== "undefined" ? loadPersistedProject() : null;

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
  frame: (persisted?.frame as Store["frame"]) || { units: "mm" as Units, unitsGuessed: false, upAxis: "+z" as UpAxis, upGuessed: false, confirmed: false },
  generation: 0,
  projectId: (persisted?.projectId as string) || null,
  projectName: (persisted?.projectName as string) || null,
  inputMode: (persisted?.inputMode as InputMode) || null,
  projectUnits: (persisted?.projectUnits as ProjectUnits) || null,
  projectUnitsConfirmed: (persisted?.projectUnitsConfirmed as boolean) || false,
  components: (persisted?.components as ProjectComponent[])?.map(withDefaults) || [],
  assemblyId: (persisted?.assemblyId as string) || null,
  selectedComponentId: (persisted?.selectedComponentId as string) || null,
  isolatedComponentId: (persisted?.isolatedComponentId as string) || null,
  explodedFactor: (persisted?.explodedFactor as number) ?? 0,
  transformMode: (persisted?.transformMode as Store["transformMode"]) || "translate",
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
  setUnits: (units) => set((s) => ({ frame: { ...s.frame, units, unitsGuessed: false } })),
  setUpAxis: (upAxis) => set((s) => ({ frame: { ...s.frame, upAxis, upGuessed: false } })),
  confirmFrame: () => set((s) => {
    const next = { frame: { ...s.frame, confirmed: true } };
    persistProject({ ...s, ...next });
    return next;
  }),
  startAnalysing: (fileName, buffer) => set((s) => ({ phase: "analysing", fileName, originalBuffer: buffer, originalFile: null, error: null, stages: { ...initialStages }, verdict: null, progress: 0, generation: s.generation + 1, frame: { ...s.frame, confirmed: false }, repairedBinary: null })),
  startAnalysingFile: (fileName, file) => set((s) => ({ phase: "analysing", fileName, originalFile: file, originalBuffer: null, error: null, stages: { ...initialStages }, verdict: null, progress: 0, generation: s.generation + 1, frame: { ...s.frame, confirmed: false }, repairedBinary: null })),
  finishChecked: (health, mesh, repaired, generation, binary) => set((s) => {
    if (generation !== s.generation) return {};
    if (!health || typeof health.triangles !== "number" || !health.bounds) {
      return { phase: "error", error: "Invalid health data from server", stages: { read: "error", weld: "pending", topology: "pending", measure: "pending" } };
    }
    const isIssues = health.openEdges > 0 || health.bodies > 1 || health.hasFlippedFaces;
    const verdict: Verdict = isIssues ? "issues" : "pass";
    const stagesDone: Record<StageId, StageStatus> = { read: "done", weld: "done", topology: "done", measure: "done" };
    let frame = s.frame;
    if (!frame.confirmed) {
      const size = health.bounds.size;
      const diag = Math.hypot(size.x, size.y, size.z);
      let units: Units = "mm";
      let unitsGuessed = true;
      if (diag > 2000) units = "m";
      else if (diag > 200) units = "cm";
      else if (diag < 0.5) units = "inch";
      let upAxis: UpAxis = "+z";
      let upGuessed = true;
      if (size.y > size.z * 2) upAxis = "+y";
      frame = { units, unitsGuessed, upAxis, upGuessed, confirmed: false };
    }
    if (s.phase === "repairing" || repaired) {
      return { phase: "checked", health, mesh, verdict, repaired: true, stages: stagesDone, originalHealth: s.originalHealth ?? s.health, originalMesh: s.originalMesh ?? s.mesh, progress: 100, frame, repairedBinary: binary ?? s.repairedBinary ?? null };
    }
    return { phase: "checked", health, mesh, verdict, stages: stagesDone, progress: 100, frame, repairedBinary: null };
  }),
  setRepairedBinary: (repairedBinary) => set({ repairedBinary }),
  undoRepair: () => set((s) => {
    if (!s.originalMesh || !s.originalHealth) return {};
    return { mesh: s.originalMesh, health: s.originalHealth, repaired: false, repairedBinary: null, verdict: s.originalHealth.openEdges > 0 || s.originalHealth.bodies > 1 ? "issues" : "pass" };
  }),
  loadAnother: () => set(() => {
    try { localStorage.removeItem("weldProject"); } catch {}
    return { phase: "empty", verdict: null, repaired: false, repairedBinary: null, fileName: null, error: null, health: null, mesh: null, originalBuffer: null, originalFile: null, stages: { ...initialStages }, progress: 0, projectId: null, projectName: null, inputMode: null, projectUnits: null, projectUnitsConfirmed: false, components: [], assemblyId: null, selectedComponentId: null, isolatedComponentId: null, explodedFactor: 0, transformMode: "translate" as const, step: "part" as Step };
  }),
  createProject: (inputMode, units, name) => set((s) => {
    const id = `proj_${Math.random().toString(36).slice(2, 8)}`;
    const asm = `asm_${Math.random().toString(36).slice(2, 8)}`;
    const next = { projectId: id, projectName: name || id, inputMode, projectUnits: units, projectUnitsConfirmed: true, assemblyId: asm, selectedComponentId: null, isolatedComponentId: null, explodedFactor: 0, transformMode: "translate" as const, components: [] as ProjectComponent[], frame: { ...s.frame, units: units as Units, unitsGuessed: false, confirmed: true }, step: "part" as Step, phase: "empty" as Phase, health: null, mesh: null, error: null, progress: 0, stages: { ...initialStages } };
    persistProject({ ...s, ...next });
    return next;
  }),
  setProjectUnits: (units) => set((s) => {
    const next = { projectUnits: units, frame: { ...s.frame, units: units as Units, unitsGuessed: false, confirmed: false } };
    persistProject({ ...s, ...next });
    return next;
  }),
  confirmProjectUnits: () => set((s) => {
    const next = { projectUnitsConfirmed: true, frame: { ...s.frame, confirmed: true } };
    persistProject({ ...s, ...next });
    return next;
  }),
  addComponent: (c) => set((s) => {
    const norm = withDefaults(c as unknown as Partial<ProjectComponent> & { id: string });
    const next = { components: [...s.components, norm] };
    persistProject({ ...s, ...next });
    return next;
  }),
  updateComponent: (id, patch) => set((s) => {
    const next = { components: s.components.map((comp) => comp.id === id ? { ...comp, ...patch } : comp) };
    persistProject({ ...s, ...next });
    return next;
  }),
  removeComponent: (id) => set((s) => {
    const next = { components: s.components.filter((comp) => comp.id !== id) };
    persistProject({ ...s, ...next });
    return next;
  }),
  clearProject: () => set(() => {
    try { localStorage.removeItem("weldProject"); } catch {}
    return { projectId: null, projectName: null, inputMode: null, projectUnits: null, projectUnitsConfirmed: false, components: [] as ProjectComponent[], assemblyId: null, selectedComponentId: null, isolatedComponentId: null, explodedFactor: 0, transformMode: "translate" as const, phase: "empty" as Phase, health: null, mesh: null, error: null };
  }),
  setComponents: (components) => set((s) => {
    const next = { components: components.map((c) => withDefaults(c as unknown as Partial<ProjectComponent> & { id: string })) };
    persistProject({ ...s, ...next });
    return next;
  }),
  selectComponent: (id) => set((s) => { const next = { selectedComponentId: id }; persistProject({ ...s, ...next }); return next; }),
  renameComponent: (id, name) => set((s) => { const next = { components: s.components.map((c) => c.id === id ? { ...c, name: name.trim() || c.name } : c) }; persistProject({ ...s, ...next }); return next; }),
  setComponentVisibility: (id, visible) => set((s) => { const next = { components: s.components.map((c) => c.id === id ? { ...c, visible } : c) }; persistProject({ ...s, ...next }); return next; }),
  toggleVisibility: (id) => set((s) => { const next = { components: s.components.map((c) => c.id === id ? { ...c, visible: !c.visible } : c) }; persistProject({ ...s, ...next }); return next; }),
  isolateComponent: (id) => set((s) => { const next = { isolatedComponentId: id }; persistProject({ ...s, ...next }); return next; }),
  toggleLock: (id) => set((s) => { const next = { components: s.components.map((c) => c.id === id ? { ...c, locked: !c.locked } : c) }; persistProject({ ...s, ...next }); return next; }),
  setComponentTransform: (id, transform) => set((s) => { const next = { components: s.components.map((c) => c.id === id && !c.locked ? { ...c, transform } : c) }; persistProject({ ...s, ...next }); return next; }),
  resetComponentTransform: (id) => set((s) => { const next = { components: s.components.map((c) => c.id === id ? { ...c, transform: defaultTransform() } : c) }; persistProject({ ...s, ...next }); return next; }),
  setComponentMaterial: (id, material, grade) => set((s) => { const next = { components: s.components.map((c) => c.id === id ? { ...c, material, materialGrade: grade } : c) }; persistProject({ ...s, ...next }); return next; }),
  setComponentThickness: (id, thickness) => set((s) => { const next = { components: s.components.map((c) => c.id === id ? { ...c, thickness } : c) }; persistProject({ ...s, ...next }); return next; }),
  setExplodedFactor: (f) => set((s) => { const next = { explodedFactor: Math.max(0, Math.min(2, f)) }; persistProject({ ...s, ...next }); return next; }),
  setTransformMode: (m) => set((s) => { const next = { transformMode: m }; persistProject({ ...s, ...next }); return next; }),
  fitAssembly: () => set({}),
  fitSelected: () => set({}),
}));
