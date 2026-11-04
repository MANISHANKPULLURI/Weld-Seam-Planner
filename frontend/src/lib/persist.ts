import { useStore } from "../state/store";
import type { Store } from "../state/store";

// The whole plan (mesh included) is kept in IndexedDB so a refresh or a closed tab loses nothing.
// Typed arrays are stored as-is by the structured clone algorithm, and shared references (the same
// mesh in the checkpoint and the current state) are stored once.

const DB = "weld-planner", STORE = "session", KEY = "current", VERSION = 1;

// Everything that makes up the user's work. Transient UI (selection, open panels, section) is left out.
const SAVED_KEYS = [
  "step", "verdict", "part", "health", "mesh", "originalMesh", "repaired", "repairStats", "repairedBinary", "frame",
  "seams", "rejectedIds", "featureChains", "detectSettings", "detection", "hiddenBodies", "candidateFilter",
  "procedures", "sequence", "waits", "job", "initial", "checkpoint",
] as const satisfies readonly (keyof Store)[];

type Saved = { version: number; savedAt: number; data: Partial<Store> };

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => { db.close(); resolve(req.result); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

function pick(s: Store): Partial<Store> {
  const out: Record<string, unknown> = {};
  for (const k of SAVED_KEYS) out[k] = s[k];
  // A running detection can't be resumed: show it as not run yet.
  const d = s.detection;
  if (d.status === "running") out.detection = { ...d, status: "idle" };
  return out as Partial<Store>;
}

export async function loadSaved(): Promise<Saved | null> {
  if (typeof indexedDB === "undefined") return null;
  try {
    const saved = await run<Saved | undefined>("readonly", (s) => s.get(KEY));
    return saved && saved.version === VERSION && saved.data?.mesh ? saved : null;
  } catch {
    return null;
  }
}

export function clearSaved() {
  if (typeof indexedDB === "undefined") return Promise.resolve();
  return run("readwrite", (s) => s.delete(KEY)).catch(() => {});
}

// Restores the last session, then saves 700 ms after any change to the work.
export async function startPersistence() {
  const saved = await loadSaved();
  if (saved && useStore.getState().phase === "empty") {
    useStore.setState({ ...saved.data, phase: "checked", saveStatus: "saved", savedAt: saved.savedAt });
  }

  let last = SAVED_KEYS.map((k) => useStore.getState()[k]);
  let timer: ReturnType<typeof setTimeout> | null = null;

  useStore.subscribe((s) => {
    const now = SAVED_KEYS.map((k) => s[k]);
    if (now.every((v, i) => v === last[i])) return;
    last = now;
    if (timer) clearTimeout(timer);
    if (s.phase === "empty") { void clearSaved(); useStore.setState({ saveStatus: "idle", savedAt: null }); return; }
    if (s.phase !== "checked") return;
    useStore.setState({ saveStatus: "saving" });
    timer = setTimeout(async () => {
      try {
        const at = Date.now();
        await run("readwrite", (store) => store.put({ version: VERSION, savedAt: at, data: pick(useStore.getState()) } satisfies Saved, KEY));
        useStore.setState({ saveStatus: "saved", savedAt: at });
      } catch {
        useStore.setState({ saveStatus: "error" });
      }
    }, 700);
  });
}
