import { parseStl } from "../domain/mesh/parse";
import { weldVertices } from "../domain/mesh/weld";
import { checkHealth } from "../domain/mesh/health";

export type StageId = "read" | "weld" | "topology" | "measure";
export type WorkerIn = { type: "parse"; buffer: ArrayBuffer; fileName: string };
export type WorkerOut =
  | { type: "stage"; id: StageId; status: "start" | "done" }
  | { type: "done"; positions: Float32Array; indices: Uint32Array; health: import("../domain/mesh/health").Health }
  | { type: "error"; message: string };

self.onmessage = async (e: MessageEvent<WorkerIn>) => {
  const { buffer } = e.data;
  try {
    post({ type: "stage", id: "read", status: "start" });
    const mesh = parseStl(buffer);
    post({ type: "stage", id: "read", status: "done" });
    post({ type: "stage", id: "weld", status: "start" });
    const welded = weldVertices(mesh);
    post({ type: "stage", id: "weld", status: "done" });
    post({ type: "stage", id: "topology", status: "start" });
    const health = checkHealth(mesh);
    post({ type: "stage", id: "topology", status: "done" });
    post({ type: "stage", id: "measure", status: "start" });
    post({ type: "stage", id: "measure", status: "done" });
    const out: WorkerOut = { type: "done", positions: welded.positions, indices: welded.indices, health };
    (self as unknown as { postMessage: (m: WorkerOut, t: Transferable[]) => void }).postMessage(out, [welded.positions.buffer, welded.indices.buffer]);
  } catch (err) {
    const message = err instanceof Error ? err.message : "This file doesn't look like a valid STL.";
    post({ type: "error", message });
  }
};

function post(m: WorkerOut) {
  (self as unknown as { postMessage: (m: WorkerOut) => void }).postMessage(m);
}
