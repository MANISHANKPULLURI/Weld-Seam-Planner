import { useStore } from "../state/store";

const API_BASE = (import.meta as unknown as { env?: { VITE_API_URL?: string } }).env?.VITE_API_URL || "http://localhost:8000";

const CHUNK_SIZE = 5 * 1024 * 1024;

function createProgressTicker(gen: number, from: number, to: number): number {
  let cur = from;
  const id = setInterval(() => {
    if (useStore.getState().generation !== gen) { clearInterval(id); return; }
    cur = Math.min(to, cur + 2);
    useStore.getState().setProgress(cur);
  }, 500) as unknown as number;
  return id;
}

function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}, ms = 120000): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  return fetch(input, { ...init, signal: controller.signal }).finally(() => clearTimeout(id));
}

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

async function safeJson(res: Response): Promise<any> {
  const text = await res.text();
  if (!text) return { error: `Request failed ${res.status}` };
  try { return JSON.parse(text); } catch { return { error: text.slice(0,300) || `Invalid response ${res.status}` }; }
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function uploadChunkedFromFile(file: File, mode: "validate" | "repair", onProgress: (p: number) => void) {

  const initRes = await fetchWithTimeout(`${API_BASE}/api/v1/mesh/upload/init`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileName: file.name, fileSize: file.size }),
  });

  const initDataFile = await safeJson(initRes) as { uploadId?: string; error?: string };
  if (!initRes.ok || !initDataFile.uploadId) throw new Error(initDataFile.error || "Upload init failed");
  const uploadIdFile = initDataFile.uploadId;
  const totalChunksFile = Math.ceil(file.size / CHUNK_SIZE);
  let uploadedFile = 0;
  let nextFile = 0;
  async function workerFile() {
    while (nextFile < totalChunksFile) {
      const idx = nextFile++;
      const chunk = file.slice(idx * CHUNK_SIZE, (idx + 1) * CHUNK_SIZE);
      const res = await fetchWithTimeout(`${API_BASE}/api/v1/mesh/upload/${uploadIdFile}/chunk?index=${idx}`, { method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: chunk });
      if (!res.ok) {
        const err = await safeJson(res) as { error?: string };
        throw new Error(err.error || "Chunk upload failed");
      }
      uploadedFile++;
      onProgress(Math.round((uploadedFile / totalChunksFile) * 85));
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, totalChunksFile) }, () => workerFile()));
  onProgress(90);
  const finalResFile = await fetchWithTimeout(`${API_BASE}/api/v1/mesh/upload/${uploadIdFile}/complete?mode=${mode}`, { method: "POST" });
  const dataFile = await safeJson(finalResFile) as { health?: unknown; error?: string; mesh?: { positions: number[]; indices: number[] }; binaryBase64?: string };
  if (!finalResFile.ok) throw new Error((dataFile as { error?: string }).error || `${mode} failed`);
  if (!dataFile.health || !dataFile.mesh) throw new Error((dataFile as { error?: string }).error || "Invalid response from server");
  onProgress(100);
  return dataFile as { health: { triangles: number; bodies: number; openEdges: number; bounds: { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number }; size: { x: number; y: number; z: number } } }; mesh: { positions: number[]; indices: number[] }; binaryBase64?: string };
}


async function uploadChunked(buffer: ArrayBuffer, fileName: string, mode: "validate" | "repair", onProgress: (p: number) => void) {

  const initRes = await fetchWithTimeout(`${API_BASE}/api/v1/mesh/upload/init`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileName, fileSize: buffer.byteLength }),
  });

  const initData = await safeJson(initRes) as { uploadId?: string; error?: string };

  if (!initRes.ok || !initData.uploadId) {
    throw new Error(initData.error || "Upload init failed");
  }

  const uploadId = initData.uploadId;

  const chunks: { index: number; chunk: ArrayBuffer }[] = [];

  for (let offset = 0, idx = 0; offset < buffer.byteLength; offset += CHUNK_SIZE, idx++) {
    chunks.push({ index: idx, chunk: buffer.slice(offset, offset + CHUNK_SIZE) });
  }

  let uploaded = 0;
  const CONCURRENCY = 4;
  let next = 0;

  async function worker() {

    while (next < chunks.length) {

      const item = chunks[next++]!;

      const res = await fetchWithTimeout(`${API_BASE}/api/v1/mesh/upload/${uploadId}/chunk?index=${item.index}`, {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: item.chunk,
      });

      if (!res.ok) {
        const err = await safeJson(res) as { error?: string };
        throw new Error(err.error || "Chunk upload failed");
      }

      uploaded += item.chunk.byteLength;
      const pct = Math.round((uploaded / buffer.byteLength) * 85);
      onProgress(pct);
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, chunks.length) }, () => worker()));

  onProgress(90);

  const finalRes = await fetchWithTimeout(`${API_BASE}/api/v1/mesh/upload/${uploadId}/complete?mode=${mode}`, {
    method: "POST",
  });

  const data = await safeJson(finalRes) as { health?: unknown; error?: string; mesh?: { positions: number[]; indices: number[] }; binaryBase64?: string };

  if (!finalRes.ok) {
    throw new Error(data.error || `${mode} failed`);
  }
  if (!data.health || !data.mesh) throw new Error(data.error || "Invalid response from server");

  onProgress(100);

  return data as { health: { triangles: number; bodies: number; openEdges: number; bounds: { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number }; size: { x: number; y: number; z: number } } }; mesh: { positions: number[]; indices: number[] }; binaryBase64?: string };
}

export async function analyseFileFromFile(file: File) {

  const store = useStore.getState();
  store.startAnalysingFile(file.name, file);

  const gen = useStore.getState().generation;

  const stages: import("../state/store").StageId[] = ["read", "weld", "topology", "measure"];

  for (const s of stages) useStore.getState().setStage(s, "active");
  useStore.getState().setProgress(5);

  const onProgress = (p: number) => {
    if (useStore.getState().generation !== gen) return;
    useStore.getState().setProgress(p);
  };
  let ticker: number | null = null;

  try {
    ticker = createProgressTicker(gen, 12, 84);
    const fileSize = file.size;
    const initRes = await fetchWithTimeout(`${API_BASE}/api/v1/mesh/upload/init`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileName: file.name, fileSize }),
    });

    const initData = await safeJson(initRes) as { uploadId?: string; error?: string };

    if (!initRes.ok || !initData.uploadId) throw new Error(initData.error || "Upload init failed");

    const uploadId = initData.uploadId;
    const totalChunks = Math.ceil(fileSize / CHUNK_SIZE);
    let uploaded = 0;
    let next = 0;

    async function worker() {

      while (next < totalChunks) {

        if (useStore.getState().generation !== gen) throw new Error("stale");

        const idx = next++ as number;
        const start = idx * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, fileSize);
        const chunk = file.slice(start, end);

        const res = await fetchWithTimeout(`${API_BASE}/api/v1/mesh/upload/${uploadId}/chunk?index=${idx}`, {
          method: "POST",
          headers: { "Content-Type": "application/octet-stream" },
          body: chunk,
        });

        if (!res.ok) {
          const err = await safeJson(res) as { error?: string };
          throw new Error(err.error || "Chunk upload failed");
        }

        uploaded++;
        onProgress(Math.round((uploaded / totalChunks) * 85));
      }
    }

    await Promise.all(Array.from({ length: Math.min(4, totalChunks) }, () => worker()));

    if (useStore.getState().generation !== gen) return;

    onProgress(90);

    const finalRes = await fetchWithTimeout(`${API_BASE}/api/v1/mesh/upload/${uploadId}/complete?mode=validate`, { method: "POST" });
    const data = await safeJson(finalRes) as { health?: unknown; error?: string; mesh?: { positions: number[]; indices: number[] } };

    if (!finalRes.ok) throw new Error((data as { error?: string }).error || "Validation failed");
    if (!data.health || !data.mesh) throw new Error((data as { error?: string }).error || "Invalid response from server");

    if (useStore.getState().generation !== gen) return;

    const raw = data as { health: { triangles: number; bodies: number; openEdges: number; bounds: { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number }; size: { x: number; y: number; z: number } } }; mesh: { positions: number[]; indices: number[] } };
    const health = toHealth(raw.health);
    const positions = new Float32Array(raw.mesh.positions);
    const indices = new Uint32Array(raw.mesh.indices);

    if (ticker) clearInterval(ticker);
    for (const s of stages) useStore.getState().setStage(s, "done");
    useStore.getState().setProgress(100);
    useStore.getState().finishChecked(health, { positions, indices, health }, false, gen);

  } catch (err) {
    if (ticker) clearInterval(ticker);
    if (useStore.getState().generation !== gen) return;

    if (err instanceof DOMException && err.name === "AbortError") { if (useStore.getState().generation !== gen) return; useStore.setState({ phase: "error", error: "Upload timed out. Please try again.", stages: { read: "error", weld: "pending", topology: "pending", measure: "pending" } }); return; }
    const message = err instanceof Error && err.message === "stale" ? "stale" : err instanceof Error ? err.message : "This file doesn't look like a valid STL.";
    if (message === "stale") return;
    useStore.setState({ phase: "error", error: message, stages: { read: "error", weld: "pending", topology: "pending", measure: "pending" } });
  }
}


export async function analyseFile(buffer: ArrayBuffer, fileName: string) {

  const store = useStore.getState();
  store.startAnalysing(fileName, buffer.slice(0));

  const gen = useStore.getState().generation;

  const stages: import("../state/store").StageId[] = ["read", "weld", "topology", "measure"];

  for (const s of stages) useStore.getState().setStage(s, "active");
  useStore.getState().setProgress(5);

  const useChunked = buffer.byteLength > CHUNK_SIZE;

  const onProgress = (p: number) => {
    if (useStore.getState().generation !== gen) return;
    useStore.getState().setProgress(p);
  };
  let ticker2: number | null = null;

  try {
    ticker2 = createProgressTicker(gen, 18, 88);
    let raw: { health: { triangles: number; bodies: number; openEdges: number; bounds: { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number }; size: { x: number; y: number; z: number } } }; mesh: { positions: number[]; indices: number[] } };

    if (useChunked) {

      raw = await uploadChunked(buffer, fileName, "validate", onProgress);

    } else {

      onProgress(30);

      const res = await fetchWithTimeout(`${API_BASE}/api/v1/mesh/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: buffer,
      });

      const data = await safeJson(res) as { health?: unknown; error?: string; mesh?: { positions: number[]; indices: number[] } };

      if (!res.ok) {
        throw new Error(data.error || "Validation failed");
      }
      if (!data.health || !data.mesh) throw new Error(data.error || "Invalid response from server");

      raw = data as typeof raw;
      onProgress(90);
    }

    if (useStore.getState().generation !== gen) return;

    const health = toHealth(raw.health);
    const positions = new Float32Array(raw.mesh.positions);
    const indices = new Uint32Array(raw.mesh.indices);

    if (ticker2) clearInterval(ticker2);
    for (const s of stages) useStore.getState().setStage(s, "done");
    useStore.getState().setProgress(100);
    useStore.getState().finishChecked(health, { positions, indices, health }, false, gen);

  } catch (err) {
    if (ticker2) clearInterval(ticker2);
    if (useStore.getState().generation !== gen) return;
    if (err instanceof DOMException && err.name === "AbortError") { useStore.setState({ phase: "error", error: "Upload timed out. Please try again.", stages: { read: "error", weld: "pending", topology: "pending", measure: "pending" } }); return; }

    if (err instanceof Error && err.message === "stale") return;

    const message = err instanceof Error ? err.message : "This file doesn't look like a valid STL.";
    useStore.setState({ phase: "error", error: message, stages: { read: "error", weld: "pending", topology: "pending", measure: "pending" } });
  }
}

export async function repairFile() {

  const state = useStore.getState();
  const file = state.originalFile;
  const buf = state.originalBuffer;
  const gen = state.generation;

  if (file) {
    useStore.setState({ phase: "repairing", progress: 5 });
    const tickerR1 = createProgressTicker(gen, 10, 92);
    try {
      const raw = await uploadChunkedFromFile(file, "repair", (p) => {
        if (useStore.getState().generation !== gen) return;
        useStore.getState().setProgress(p);
      });
      if (useStore.getState().generation !== gen) { clearInterval(tickerR1); return; }
      const health = toHealth(raw.health);
      const positions = new Float32Array(raw.mesh.positions);
      const indices = new Uint32Array(raw.mesh.indices);
      const binary = raw.binaryBase64 ? base64ToArrayBuffer(raw.binaryBase64) : null;
      clearInterval(tickerR1);
      useStore.getState().setProgress(100);
      useStore.getState().finishChecked(health, { positions, indices, health }, true, gen, binary);
    } catch (err) {
      clearInterval(tickerR1);
      if (useStore.getState().generation !== gen) return;
      if (err instanceof DOMException && err.name === "AbortError") { useStore.setState({ phase: "error", error: "Repair timed out. Please try again." }); return; }
      if (err instanceof Error && err.message === "stale") return;
      const message = err instanceof Error ? err.message : "Repair failed";
      useStore.setState({ phase: "error", error: message });
    }
    return;
  }

  if (!buf) return;

  useStore.setState({ phase: "repairing", progress: 5 });
  const tickerR2 = createProgressTicker(gen, 10, 92);

  const useChunked = buf.byteLength > CHUNK_SIZE;

  const onProgress = (p: number) => {
    if (useStore.getState().generation !== gen) return;
    useStore.getState().setProgress(p);
  };

  try {

    let raw: { health: { triangles: number; bodies: number; openEdges: number; bounds: { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number }; size: { x: number; y: number; z: number } } }; mesh: { positions: number[]; indices: number[] }; binaryBase64?: string };

    if (useChunked) {

      raw = await uploadChunked(buf, state.fileName || "repair.stl", "repair", onProgress);

    } else {

      onProgress(30);

      const res = await fetchWithTimeout(`${API_BASE}/api/v1/mesh/repair`, {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: buf,
      });

      const data = await safeJson(res) as { health?: unknown; error?: string; mesh?: { positions: number[]; indices: number[] }; binaryBase64?: string };

      if (!res.ok) {
        throw new Error(data.error || "Repair failed");
      }
      if (!data.health || !data.mesh) throw new Error(data.error || "Invalid response from server");

      raw = data as typeof raw;
      onProgress(90);
    }

    if (useStore.getState().generation !== gen) return;

    const health = toHealth(raw.health);
    const positions = new Float32Array(raw.mesh.positions);
    const indices = new Uint32Array(raw.mesh.indices);
    const binary = raw.binaryBase64 ? base64ToArrayBuffer(raw.binaryBase64) : null;

    clearInterval(tickerR2);
    useStore.getState().setProgress(100);
    useStore.getState().finishChecked(health, { positions, indices, health }, true, gen, binary);

  } catch (err) {
    clearInterval(tickerR2);
    if (useStore.getState().generation !== gen) return;
    if (err instanceof DOMException && err.name === "AbortError") { useStore.setState({ phase: "error", error: "Repair timed out. Please try again." }); return; }
    if (err instanceof Error && err.message === "stale") return;

    const message = err instanceof Error ? err.message : "Repair failed";
    useStore.setState({ phase: "error", error: message });
  }
}

export function resetWorker() {
}
