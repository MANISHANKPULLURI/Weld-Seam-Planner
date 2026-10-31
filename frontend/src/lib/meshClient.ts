import type { WorkerOut, StageId } from "../workers/mesh.worker";
import { useStore } from "../state/store";

let worker: Worker | null = null;
const stageStart = new Map<StageId, number>();
let totalDelay = 0;

function getWorker(): Worker {
  if (!worker) worker = new Worker(new URL("../workers/mesh.worker.ts", import.meta.url), { type: "module" });
  return worker;
}

export function analyseFile(buffer: ArrayBuffer, fileName: string) {
  const store = useStore.getState();
  store.startAnalysing(fileName, buffer.slice(0));
  stageStart.clear();
  totalDelay = 0;
  const w = getWorker();
  w.onmessage = (e: MessageEvent<WorkerOut>) => {
    const msg = e.data;
    if (msg.type === "stage") {
      const id = msg.id as StageId;
      if (msg.status === "start") {
        stageStart.set(id, Date.now());
        useStore.getState().setStage(id, "active");
      } else {
        const start = stageStart.get(id) ?? Date.now();
        const elapsed = Date.now() - start;
        const needed = Math.max(0, 300 - elapsed);
        const remainingBudget = Math.max(0, 1200 - totalDelay);
        const delay = Math.min(needed, remainingBudget);
        totalDelay += delay;
        setTimeout(() => useStore.getState().setStage(id, "done"), delay);
      }
    } else if (msg.type === "done") {
      const doneAll = () => useStore.getState().finishChecked(msg.health, { positions: msg.positions, indices: msg.indices, health: msg.health }, false);
      const pending = totalDelay;
      if (pending > 0) setTimeout(doneAll, pending + 20);
      else doneAll();
    } else if (msg.type === "error") {
      useStore.setState({ phase: "error", error: msg.message, stages: { read: "error", weld: "pending", topology: "pending", measure: "pending" } });
    }
  };
  w.onerror = () => {
    useStore.setState({ phase: "error", error: "This file doesn't look like a valid STL." });
  };
  w.postMessage({ type: "parse", buffer, fileName }, [buffer]);
}

export function resetWorker() {
  if (worker) { worker.terminate(); worker = null; }
}
