import { useStore } from "../state/store";
import type { Store } from "../state/store";





const DB = "weld-planner", STORE = "session", KEY = "current", VERSION = 1;


const SAVED_KEYS = [
  "step", "verdict", "part", "health", "mesh", "originalMesh", "repaired", "repairStats", "repairedBinary", "frame",
  "seams", "rejectedIds", "featureChains", "detectSettings", "detection", "hiddenBodies", "candidateFilter",
  "procedures", "sequence", "waits", "job", "initial", "checkpoint",
] as const satisfies readonly (keyof Store)[];

type Saved = { version: number; savedAt: number; data: Partial<Store> };

/**
 * open the indexeddb session database
 */
function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * run one indexeddb transaction and return its result
 */
async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => { db.close(); resolve(req.result); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

/**
 * select the store slice that is saved between sessions
 */
function pick(s: Store): Partial<Store> {
  const out: Record<string, unknown> = {};
  for (const k of SAVED_KEYS) out[k] = s[k];
  
  const d = s.detection;
  if (d.status === "running") out.detection = { ...d, status: "idle" };
  return out as Partial<Store>;
}

/**
 * check a saved session has the expected shape
 */
function shapeOk(data: Partial<Store>): boolean {
  if (typeof data !== "object" || data === null) return false;
  if (data.mesh !== undefined && data.mesh !== null && typeof data.mesh !== "object") return false;
  if (data.seams !== undefined && !Array.isArray(data.seams)) return false;
  if (data.procedures !== undefined && !Array.isArray(data.procedures)) return false;
  if (data.job !== undefined && (typeof data.job !== "object" || data.job === null)) return false;
  return true;
}

/**
 * load the saved session, if one exists and looks valid
 */
export async function loadSaved(): Promise<Saved | null> {
  if (typeof indexedDB === "undefined") return null;
  try {
    const saved = await run<Saved | undefined>("readonly", (s) => s.get(KEY));
    if (!saved || saved.version !== VERSION || !saved.data?.mesh) return null;
    if (!shapeOk(saved.data)) return null;
    return saved;
  } catch {
    return null;
  }
}

/**
 * delete the saved session from the browser
 */
export function clearSaved() {
  if (typeof indexedDB === "undefined") return Promise.resolve();
  return run("readwrite", (s) => s.delete(KEY)).catch(() => {});
}




/**
 * save the session, shedding bulk on quota errors
 */
async function saveWithFallback(s: Store, at: number): Promise<void> {
  const full: Saved = { version: VERSION, savedAt: at, data: pick(s) };
  try {
    await run("readwrite", (store) => store.put(full, KEY));
    return;
  } catch {  }
  const noBinary: Saved = { version: VERSION, savedAt: at, data: { ...full.data, repairedBinary: null } };
  try {
    await run("readwrite", (store) => store.put(noBinary, KEY));
    return;
  } catch {  }
  const slim: Saved = { version: VERSION, savedAt: at, data: { ...noBinary.data, initial: null, checkpoint: null } };
  await run("readwrite", (store) => store.put(slim, KEY));
}



let restoreEpoch = 0;

/**
 * forget the saved session and ignore late restores
 */
export function discardSavedSession() {
  restoreEpoch += 1;
  void clearSaved();
}



/**
 * restore the saved session and autosave later changes
 */
export async function startPersistence() {
  const epoch = restoreEpoch;
  const saved = await loadSaved();
  if (saved && restoreEpoch === epoch && useStore.getState().phase === "empty") {
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
        await saveWithFallback(useStore.getState(), at);
        useStore.setState({ saveStatus: "saved", savedAt: at });
      } catch {
        useStore.setState({ saveStatus: "error" });
      }
    }, 700);
  });
}
