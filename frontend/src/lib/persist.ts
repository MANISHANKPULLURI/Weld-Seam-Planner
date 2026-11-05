import { useStore } from "../state/store";
import type { Store } from "../state/store";





const DB = "weld-planner", STORE = "session", KEY = "current", PROJECTS_KEY = "projects", VERSION = 1;

export const MAX_PROJECTS = 5;

export type ProjectMeta = { id: string; name: string; fileName: string | null; savedAt: number };


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
async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => { db.close(); resolve(req ? req.result : undefined); };
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
 * read the project registry (up to MAX_PROJECTS slots)
 */
export async function listProjects(): Promise<ProjectMeta[]> {
  if (typeof indexedDB === "undefined") return [];
  try {
    const all = await run<ProjectMeta[] | undefined>("readonly", (s) => s.get(PROJECTS_KEY));
    return Array.isArray(all) ? all.slice(0, MAX_PROJECTS) : [];
  } catch { return []; }
}

async function writeProjects(all: ProjectMeta[]): Promise<void> {
  await run("readwrite", (s) => s.put(all.slice(0, MAX_PROJECTS), PROJECTS_KEY));
}

/**
 * id of the project the planner currently has open
 */
export function currentProjectId(): string | null {
  try { return localStorage.getItem("weld.project.current"); } catch { return null; }
}

function setCurrentProjectId(id: string) {
  try { localStorage.setItem("weld.project.current", id); } catch { /* ignore */ }
}

function projectName(s: Store): string {
  return s.job.name || s.part?.fileName?.replace(/\.stl$/i, "") || "Untitled project";
}

/**
 * stash the live state into a project slot and refresh its registry entry
 */
export async function saveProjectSnapshot(id: string): Promise<void> {
  const s = useStore.getState();
  const at = Date.now();
  try {
    await saveWithFallback(s, at, `proj:${id}`);
  } catch { /* quota: keep registry, skip bulk */ }
  try {
    const all = await listProjects();
    const meta: ProjectMeta = { id, name: projectName(s), fileName: s.part?.fileName ?? null, savedAt: at };
    const next = [meta, ...all.filter((p) => p.id !== id)];
    await writeProjects(next);
  } catch { /* registry write failed; snapshot still kept */ }
}

/**
 * load a project slot into the live store
 */
export async function openProjectSnapshot(id: string): Promise<boolean> {
  let saved: Saved | undefined;
  try {
    saved = await run<Saved | undefined>("readonly", (s) => s.get(`proj:${id}`));
  } catch { return false; }
  if (!saved || saved.version !== VERSION || !shapeOk(saved.data)) return false;
  setOpenProject(id);
  useStore.setState({ ...saved.data, focus: null, cameraTarget: null, reviewing: false, undo: null, redo: null, selectedSeamId: null, hoverSeamId: null, cardAnchor: null, pendingAction: null, splitCuts: null, procDraft: null, procEditId: null, section: null, workArea: null, xray: false, phase: saved.data.mesh ? "checked" as const : ("empty" as const), saveStatus: "saved" as const, savedAt: saved.savedAt });
  return true;
}

/**
 * create a project slot, or null when the 5-project cap is reached
 */
export async function createProject(name?: string): Promise<string | null> {
  const all = await listProjects();
  if (all.length >= MAX_PROJECTS) return null;
  const id = `proj_${Date.now().toString(36)}`;
  const meta: ProjectMeta = { id, name: name ?? `Project ${all.length + 1}`, fileName: null, savedAt: Date.now() };
  try { await writeProjects([meta, ...all]); } catch { return null; }
  return id;
}

/**
 * drop a project slot entirely
 */
export async function deleteProject(id: string): Promise<void> {
  try {
    await run("readwrite", (s) => s.delete(`proj:${id}`));
    await writeProjects((await listProjects()).filter((p) => p.id !== id));
  } catch { /* ignore */ }
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
async function saveWithFallback(s: Store, at: number, key: string = KEY): Promise<void> {
  const full: Saved = { version: VERSION, savedAt: at, data: pick(s) };
  try {
    await run("readwrite", (store) => store.put(full, key));
    return;
  } catch { /* fall through to slimmer shapes */ }
  const noBinary: Saved = { version: VERSION, savedAt: at, data: { ...full.data, repairedBinary: null } };
  try {
    await run("readwrite", (store) => store.put(noBinary, key));
    return;
  } catch { /* fall through to slimmer shapes */ }
  const slim: Saved = { version: VERSION, savedAt: at, data: { ...noBinary.data, initial: null, checkpoint: null } };
  await run("readwrite", (store) => store.put(slim, key));
}

let openId: string | null = null;

function refreshRegistry(s: Store, at: number): void {
  if (!openId) return;
  void (async () => {
    try {
      const all = await listProjects();
      const meta: ProjectMeta = { id: openId as string, name: projectName(s), fileName: s.part?.fileName ?? null, savedAt: at };
      await writeProjects([meta, ...all.filter((x) => x.id !== openId)]);
    } catch { /* registry is best-effort */ }
  })();
}

/**
 * point the autosave at a project slot (or none for the legacy single slot)
 */
export function setOpenProject(id: string | null) {
  openId = id;
  try {
    if (id) localStorage.setItem("weld.project.current", id);
    else localStorage.removeItem("weld.project.current");
  } catch { /* ignore */ }
}

/**
 * load the open project for resume, adopting any legacy single-slot save
 */
export async function loadOpenProject(): Promise<Saved | null> {
  const id = currentProjectId();
  if (id) {
    try {
      const saved = await run<Saved | undefined>("readonly", (s) => s.get(`proj:${id}`));
      if (saved && saved.version === VERSION && shapeOk(saved.data)) { openId = id; return saved; }
    } catch { /* fall through to legacy */ }
  }
  const legacy = await loadSaved();
  if (legacy) {
    const adopted = (await createProject(legacy.data.part?.fileName?.replace(/\.stl$/i, "") || "Recovered project")) ?? `proj_${Date.now().toString(36)}`;
    openId = adopted;
    setCurrentProjectId(adopted);
    try {
      await run("readwrite", (s) => { s.put(legacy, `proj:${adopted}`); s.delete(KEY); });
      const all = await listProjects();
      await writeProjects([{ id: adopted, name: legacy.data.part?.fileName?.replace(/\.stl$/i, "") ?? "Recovered project", fileName: legacy.data.part?.fileName ?? null, savedAt: legacy.savedAt }, ...all.filter((x) => x.id !== adopted)]);
    } catch { /* keep legacy key as fallback */ }
    return legacy;
  }
  return null;
}

let restoreEpoch = 0;

/**
 * forget the saved session and ignore late restores
 */
export function discardSavedSession() {
  restoreEpoch += 1;
  void clearSaved();
  if (openId) {
    const id = openId;
    openId = null;
    try { localStorage.removeItem("weld.project.current"); } catch { /* ignore */ }
    void deleteProject(id);
  }
}



/**
 * restore the saved session and autosave later changes
 */
export async function startPersistence() {
  const epoch = restoreEpoch;
  const saved = await loadOpenProject();
  if (saved && restoreEpoch === epoch && useStore.getState().phase === "empty") {
    useStore.setState({ ...saved.data, phase: saved.data.mesh ? "checked" : "empty", saveStatus: "saved", savedAt: saved.savedAt });
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
        const st = useStore.getState();
        await saveWithFallback(st, at, openId ? `proj:${openId}` : KEY);
        refreshRegistry(st, at);
        useStore.setState({ saveStatus: "saved", savedAt: at });
      } catch {
        useStore.setState({ saveStatus: "error" });
      }
    }, 700);
  });
}
