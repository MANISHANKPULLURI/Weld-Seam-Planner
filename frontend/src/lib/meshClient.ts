import { useStore } from "../state/store";

const API_BASE = (import.meta as unknown as { env?: { VITE_API_URL?: string } }).env?.VITE_API_URL || "http://localhost:8000";

function toHealth(raw: {
  triangles: number;
  bodies: number;
  openEdges: number;
  nonManifold?: number;
  bounds: { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number }; size: { x: number; y: number; z: number } };
}) {
  return {
    triangles: raw.triangles,
    bodies: raw.bodies,
    openEdges: raw.openEdges,
    bounds: raw.bounds,
    hasFlippedFaces: false,
  };
}

export async function analyseFile(buffer: ArrayBuffer, fileName: string) {

  const store = useStore.getState();
  store.startAnalysing(fileName, buffer.slice(0));

  const stages: import("../state/store").StageId[] = ["read", "weld", "topology", "measure"];

  for (const s of stages) useStore.getState().setStage(s, "active");

  try {

    const res = await fetch(`${API_BASE}/api/v1/mesh/validate`, {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream" },
      body: buffer,
    });

    const data = await res.json() as { health?: unknown; error?: string; mesh?: { positions: number[]; indices: number[] } };

    if (!res.ok) {
      throw new Error(data.error || "Validation failed");
    }

    const raw = data as { health: { triangles: number; bodies: number; openEdges: number; bounds: { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number }; size: { x: number; y: number; z: number } } }; mesh: { positions: number[]; indices: number[] } };
    const health = toHealth(raw.health);
    const positions = new Float32Array(raw.mesh.positions);
    const indices = new Uint32Array(raw.mesh.indices);

    for (const s of stages) useStore.getState().setStage(s, "done");

    useStore.getState().finishChecked(health, { positions, indices, health }, false);

  } catch (err) {

    const message = err instanceof Error ? err.message : "This file doesn't look like a valid STL.";
    useStore.setState({ phase: "error", error: message, stages: { read: "error", weld: "pending", topology: "pending", measure: "pending" } });
  }
}

export async function repairFile() {

  const state = useStore.getState();
  const buf = state.originalBuffer;

  if (!buf) return;

  useStore.setState({ phase: "repairing" });

  try {

    const res = await fetch(`${API_BASE}/api/v1/mesh/repair`, {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream" },
      body: buf,
    });

    const data = await res.json() as { health?: unknown; error?: string; mesh?: { positions: number[]; indices: number[] } };

    if (!res.ok) {
      throw new Error(data.error || "Repair failed");
    }

    const raw = data as { health: { triangles: number; bodies: number; openEdges: number; bounds: { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number }; size: { x: number; y: number; z: number } } }; mesh: { positions: number[]; indices: number[] } };
    const health = toHealth(raw.health);
    const positions = new Float32Array(raw.mesh.positions);
    const indices = new Uint32Array(raw.mesh.indices);

    useStore.getState().finishChecked(health, { positions, indices, health }, true);

  } catch (err) {

    const message = err instanceof Error ? err.message : "Repair failed";
    useStore.setState({ phase: "error", error: message });
  }
}

export function resetWorker() {
}
