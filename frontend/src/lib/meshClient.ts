import { MM_PER_UNIT } from "@weld/core";
import { autoMinLengthMm, useStore } from "../state/store";
import type { DetectOptions } from "@weld/core";
import type { MeshWorkerRequest, MeshWorkerResponse } from "../workers/protocol";

let worker: Worker | null = null;
let requestId = 0;

function freshWorker(): Worker {
  worker?.terminate();
  worker = new Worker(new URL("../workers/mesh.worker.ts", import.meta.url), { type: "module" });
  return worker;
}

function currentWorker(): Worker {
  return worker ?? freshWorker();
}

function run(target: Worker, request: MeshWorkerRequest, transfer: Transferable[], onMessage: (message: MeshWorkerResponse) => void, onCrash: () => void) {
  target.onmessage = (event: MessageEvent<MeshWorkerResponse>) => {
    if (event.data.id === request.id) onMessage(event.data);
  };
  target.onerror = (event) => {
    event.preventDefault();
    onCrash();
  };
  target.postMessage(request, transfer);
}

// Starting a new file terminates any analysis still running, so the newest file always wins.
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

// Settings are entered in mm; detection works in the file's own units. Hidden bodies are skipped and
// a confirmed work area keeps only its side. An unconfirmed section is just a view.
export function detectWithSettings() {
  const { detectSettings: d, frame, health, hiddenBodies, workArea } = useStore.getState();
  const scale = MM_PER_UNIT[frame.units];
  const minLengthMm = d.minLengthMm ?? autoMinLengthMm(health, frame.units);
  const region = { hiddenBodies, keep: workArea?.plane ?? null };
  detectSeams({ featureAngleDeg: d.featureAngleDeg, minLength: minLengthMm / scale, contactTolerance: d.gapMm / scale, includeOutside: d.includeOutside, region }, detectionScope(workArea?.label ?? null, hiddenBodies.length));
}

export function detectionScope(area: string | null, hidden: number): string | null {
  if (area && hidden) return `in ${area}, ${hidden} hidden part${hidden === 1 ? "" : "s"} skipped`;
  if (area) return `in ${area}`;
  if (hidden) return `on visible parts, ${hidden} hidden part${hidden === 1 ? "" : "s"} skipped`;
  return null;
}
