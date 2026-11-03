import { useRef, useState } from "react";
import { useStore } from "../../state/store";
import { UploadIcon, AlertIcon } from "../icons";
import { MAX_FILE_BYTES, CHUNK_BYTES } from "../../config/limits";
import { UnitSelector } from "./UnitSelector";

const API_BASE = (import.meta as unknown as { env?: { VITE_API_URL?: string } }).env?.VITE_API_URL || "";
const CHUNK_SIZE = CHUNK_BYTES;

function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}, ms = 120000): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  return fetch(input, { ...init, signal: controller.signal }).finally(() => clearTimeout(id));
}

async function safeJson(res: Response): Promise<Record<string, unknown>> {
  const t = await res.text();
  if (!t) return { error: `Request failed ${res.status}` };
  try { return JSON.parse(t) as Record<string, unknown>; } catch { return { error: t.slice(0, 300) || `Invalid response ${res.status}` }; }
}

async function validateStl(file: File) {
  try {
    if (file.size > CHUNK_SIZE) {
      const initRes = await fetchWithTimeout(`${API_BASE}/api/v1/mesh/upload/init`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: file.name, fileSize: file.size }),
      });
      const initData = await safeJson(initRes) as { uploadId?: string; error?: string };
      if (!initRes.ok || !initData.uploadId) throw new Error(initData.error || "Upload init failed");
      const uploadId = initData.uploadId;
      const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
      let next = 0;
      async function worker() {
        while (next < totalChunks) {
          const idx = next++;
          const chunk = file.slice(idx * CHUNK_SIZE, (idx + 1) * CHUNK_SIZE);
          const res = await fetchWithTimeout(`${API_BASE}/api/v1/mesh/upload/${uploadId}/chunk?index=${idx}`, {
            method: "POST",
            headers: { "Content-Type": "application/octet-stream" },
            body: chunk,
          });
          if (!res.ok) {
            const d = await safeJson(res) as { error?: string };
            throw new Error(d.error || "Chunk upload failed");
          }
        }
      }
      await Promise.all(Array.from({ length: Math.min(4, totalChunks) }, () => worker()));
      const finalRes = await fetchWithTimeout(`${API_BASE}/api/v1/mesh/upload/${uploadId}/complete?mode=validate`, { method: "POST" });
      const fd = await safeJson(finalRes) as { error?: string; health?: unknown; mesh?: unknown };
      if (!finalRes.ok) throw new Error(fd.error || "Validation failed");
      return fd as { health: { triangles: number; bodies: number; openEdges: number; bounds: { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number }; size: { x: number; y: number; z: number } } }; mesh: { positions: number[]; indices: number[] } };
    }
    const buf = await file.arrayBuffer();
    const res = await fetchWithTimeout(`${API_BASE}/api/v1/mesh/validate`, {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream" },
      body: buf,
    });
    const data = await safeJson(res) as { error?: string; health?: unknown; mesh?: unknown };
    if (!res.ok) throw new Error((data.error as string) || "Validation failed");
    return data as { health: { triangles: number; bodies: number; openEdges: number; bounds: { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number }; size: { x: number; y: number; z: number } } }; mesh: { positions: number[]; indices: number[] } };
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw new Error("Upload timed out. Please try again.");
    if (err instanceof TypeError && err.message.includes("fetch")) throw new Error("Failed to fetch. Is the backend running at " + (API_BASE || "proxy") + "?");
    throw err;
  }
}

export function SingleStlFlow() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const projectUnits = useStore((s) => s.projectUnits) || "mm";
  const setComponents = useStore((s) => s.setComponents);

  async function handleFile(file: File) {
    if (!file.name.toLowerCase().endsWith(".stl")) { setError("Choose an .stl file."); return; }
    if (file.size > MAX_FILE_BYTES) { setError(`That file is over ${MAX_FILE_BYTES / 1024 / 1024}MB. Try a simplified export.`); return; }
    if (file.size === 0) { setError("No triangles found. This doesn't look like an STL file."); return; }
    setError(null);
    setLoading(true);
    try {
      const data = await validateStl(file);
      if (!data.health || !data.mesh) throw new Error("Invalid response from server");
      const positions = new Float32Array(data.mesh.positions);
      const indices = new Uint32Array(data.mesh.indices);
      const health = { triangles: data.health.triangles, bodies: data.health.bodies, openEdges: data.health.openEdges, bounds: data.health.bounds, hasFlippedFaces: false };
      const id = `cmp_${Math.random().toString(36).slice(2, 8)}`;
      const comp = {
        id,
        name: file.name.replace(/\.stl$/i, ""),
        originalFilename: file.name,
        triangleCount: health.triangles,
        vertexCount: positions.length / 3,
        bounds: health.bounds,
        health,
        units: projectUnits,
        status: "validated" as const,
        positions,
        indices,
      };
      setComponents([comp]);
      const { finishChecked, generation } = useStore.getState();
      const gen = generation;
      useStore.getState().startAnalysingFile(file.name, file);
      finishChecked(health, { positions, indices, health }, false, gen + 1);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Parsing failed";
      if (msg.toLowerCase().includes("non-finite")) setError("Non-finite coordinates detected.");
      else setError(msg);
    } finally {
      setLoading(false);
    }
  }

  function validateAndLoad(file: File) {
    handleFile(file);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) {
      if (e.dataTransfer.files.length > 1) setError("Single STL mode accepts exactly one file.");
      validateAndLoad(f);
    }
  }

  function onBrowse(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) validateAndLoad(f);
    e.target.value = "";
  }

  const fileName = useStore((s) => s.fileName);
  const health = useStore((s) => s.health);

  return (
    <div className="single-flow">
      <UnitSelector />
      <div
        className={`dropzone${dragOver ? " dropzone-drag" : ""}`}
        role="button"
        tabIndex={0}
        aria-label="Drop an STL here"
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); inputRef.current?.click(); } }}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
      >
        <UploadIcon size={28} />
        <div className="dropzone-title">Drop an STL here</div>
        <div className="dropzone-helper">Single STL — one file containing a part or pre-combined assembly. Up to {MAX_FILE_BYTES / 1024 / 1024}MB, {CHUNK_BYTES / 1024 / 1024}MB chunks.</div>
        <div className="dropzone-actions" onClick={(e) => e.stopPropagation()}>
          <button type="button" className="btn-secondary" onClick={() => inputRef.current?.click()} disabled={loading}>{loading ? "Validating…" : "Browse files"}</button>
        </div>
      </div>
      <input ref={inputRef} type="file" accept=".stl" hidden onChange={onBrowse} />
      {error && <div role="alert" className="dropzone-error"><AlertIcon size={14} /> {error}</div>}
      {fileName && health && <div className="import-summary">Loaded: {fileName} · {health.triangles} tris · {health.bounds.size.x.toFixed(1)}×{health.bounds.size.y.toFixed(1)}×{health.bounds.size.z.toFixed(1)} {projectUnits}</div>}
    </div>
  );
}
