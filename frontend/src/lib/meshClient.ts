import { MM_PER_UNIT } from "@weld/core";
import { autoMinLengthMm, useStore } from "../state/store";
import type { DetectOptions } from "@weld/core";
import type { MeshWorkerRequest, MeshWorkerResponse } from "../workers/protocol";
import { isMeshWorkerResponse } from "../workers/protocol";

let worker: Worker | null = null;
let requestId = 0;


let clientGeneration = 0;

type Pending = {
  generation: number;
  timer: ReturnType<typeof setTimeout>;
  onMessage: (message: MeshWorkerResponse) => void;
  onCrash: () => void;
};

const pending = new Map<number, Pending>();
const REQUEST_TIMEOUT_MS = 60_000;

/**
 * forget a timed-out or answered worker request
 */
function drop(id: number) {
  const entry = pending.get(id);
  if (!entry) return;
  pending.delete(id);
  clearTimeout(entry.timer);
}

/**
 * restart the mesh worker and drop stale requests
 */
function freshWorker(): Worker {
  worker?.terminate();
  
  
  for (const [id, entry] of pending) {
    if (entry.generation !== clientGeneration) { pending.delete(id); clearTimeout(entry.timer); }
  }
  clientGeneration += 1;
  worker = new Worker(new URL("../workers/mesh.worker.ts", import.meta.url), { type: "module" });
  attach(worker);
  return worker;
}

/**
 * return the live worker, starting one if needed
 */
function currentWorker(): Worker {
  return worker ?? freshWorker();
}



/**
 * route worker replies and crashes to their requests
 */
function attach(target: Worker) {
  target.onmessage = (event: MessageEvent) => {
    const data: unknown = event.data;
    if (!isMeshWorkerResponse(data)) return;
    const entry = pending.get(data.id);
    if (!entry) return;
    if (entry.generation !== clientGeneration) { drop(data.id); return; }
    if (data.type === "progress") { entry.onMessage(data); return; }
    drop(data.id);
    entry.onMessage(data);
  };
  target.onerror = (event) => {
    event.preventDefault();
    for (const [id, entry] of [...pending]) {
      if (entry.generation !== clientGeneration) continue;
      pending.delete(id);
      clearTimeout(entry.timer);
      entry.onCrash();
    }
  };
}

/**
 * send one request to the worker with timeout and crash guards
 */
function run(target: Worker, request: MeshWorkerRequest, transfer: Transferable[], onMessage: (message: MeshWorkerResponse) => void, onCrash: () => void) {
  if (target !== worker) attach(target);
  const timer: ReturnType<typeof setTimeout> = setTimeout(() => {
    if (!pending.has(request.id)) return;
    drop(request.id);
    onCrash();
  }, REQUEST_TIMEOUT_MS);
  
  (timer as unknown as { unref?: () => void }).unref?.();
  const entry: Pending = { generation: clientGeneration, timer, onMessage, onCrash };
  pending.set(request.id, entry);
  target.postMessage(request, transfer);
}


/**
 * analyse an STL file in the worker and track progress
 */
export function analyseFile(source: File | ArrayBuffer, name: string) {
  const store = useStore.getState();
  const sizeBytes = source instanceof ArrayBuffer ? source.byteLength : source.size;
  const generation = store.startAnalysing(name, sizeBytes);
  const id = ++requestId;

  run(
    freshWorker(),
    { type: "analyse", id, source, name },
    source instanceof ArrayBuffer ? [source] : [],
    (message) => {
      const s = useStore.getState();
      if (message.type === "progress") s.setStageProgress(generation, message.stage, message.fraction);
      else if (message.type === "analysed") s.finishAnalysis(generation, message.result);
      else if (message.type === "error") s.failAnalysis(generation, message.message);
    },
    () => useStore.getState().failAnalysis(generation, "This browser could not process the file. Try a smaller or simplified export."),
  );
}

/**
 * repair the loaded mesh in the worker
 */
export function repairCurrentMesh() {
  const state = useStore.getState();
  const mesh = state.originalMesh ?? state.mesh;
  if (!mesh) return;

  const generation = state.startRepair();
  const id = ++requestId;

  run(
    currentWorker(),
    { type: "repair", id, vertices: mesh.positions.slice(), indices: mesh.orientedIndices.slice(), previous: mesh.health },
    [],
    (message) => {
      const s = useStore.getState();
      if (message.type === "repaired") s.finishRepair(generation, message.result);
      else if (message.type === "error") s.failRepair(generation, message.message);
    },
    () => useStore.getState().failRepair(generation, "Repair failed in this browser."),
  );
}

/**
 * find weld seams in the worker for the given options
 */
export function detectSeams(options: DetectOptions, scope: string | null = null) {
  const state = useStore.getState();
  const mesh = state.mesh;
  if (!mesh) return;

  const generation = state.startDetect(scope);
  const id = ++requestId;

  run(
    currentWorker(),
    { type: "detect", id, vertices: mesh.positions, indices: mesh.orientedIndices, bodyOfTriangle: mesh.bodyOfTriangle, options },
    [],
    (message) => {
      const s = useStore.getState();
      if (message.type === "detected") s.finishDetect(generation, message.result);
      else if (message.type === "error") s.failDetect(generation, message.message);
    },
    () => useStore.getState().failDetect(generation, "Seam detection failed in this browser."),
  );
}



/**
 * detect seams using the current UI settings and scope
 */
export function detectWithSettings() {
  const { detectSettings: d, frame, health, hiddenBodies, workArea } = useStore.getState();
  const scale = MM_PER_UNIT[frame.units];
  const minLengthMm = d.minLengthMm ?? autoMinLengthMm(health, frame.units);
  const region = { hiddenBodies, keep: workArea?.plane ?? null };
  detectSeams({ featureAngleDeg: d.featureAngleDeg, minLength: minLengthMm / scale, contactTolerance: d.gapMm / scale, includeOutside: d.includeOutside, region }, detectionScope(workArea?.label ?? null, hiddenBodies.length));
}

/**
 * describe where detection will search, if narrowed
 */
export function detectionScope(area: string | null, hidden: number): string | null {
  if (area && hidden) return `in ${area}, ${hidden} hidden part${hidden === 1 ? "" : "s"} skipped`;
  if (area) return `in ${area}`;
  if (hidden) return `on visible parts, ${hidden} hidden part${hidden === 1 ? "" : "s"} skipped`;
  return null;
}
