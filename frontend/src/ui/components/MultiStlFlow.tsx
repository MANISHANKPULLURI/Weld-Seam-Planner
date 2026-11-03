import { useRef, useState } from "react";
import { useStore } from "../../state/store";
import { UploadIcon, AlertIcon } from "../icons";
import { MAX_FILE_BYTES, CHUNK_BYTES, MAX_COMPONENTS } from "../../config/limits";
import { UnitSelector } from "./UnitSelector";
import { ComponentList } from "./ComponentList";

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

function toHealth(raw: { triangles: number; bodies: number; openEdges: number; nonManifold?: number; bounds: { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number }; size: { x: number; y: number; z: number } } }) {
  return { triangles: raw.triangles, bodies: raw.bodies, openEdges: raw.openEdges, bounds: raw.bounds, hasFlippedFaces: false };
}

async function validateStlFile(file: File) {
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

export function MultiStlFlow() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const components = useStore((s) => s.components);
  const projectUnits = useStore((s) => s.projectUnits) || "mm";
  const addComponent = useStore((s) => s.addComponent);
  const updateComponent = useStore((s) => s.updateComponent);
  const removeComponent = useStore((s) => s.removeComponent);

  async function validateFile(file: File, id: string) {
    updateComponent(id, { status: "validating" });
    if (!file.name.toLowerCase().endsWith(".stl")) {
      updateComponent(id, { status: "error", error: "Unsupported file format. Only .stl is supported." });
      return;
    }
    if (file.size === 0) {
      updateComponent(id, { status: "error", error: "Empty file" });
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      updateComponent(id, { status: "error", error: `File too large. Max ${MAX_FILE_BYTES / 1024 / 1024}MB.` });
      return;
    }
    if (!Number.isFinite(file.size)) {
      updateComponent(id, { status: "error", error: "Invalid file size." });
      return;
    }
    try {
      const data = await validateStlFile(file);
      if (!data.health || !data.mesh) throw new Error("Invalid response from server");
      const health = toHealth(data.health);
      const positions = new Float32Array(data.mesh.positions);
      const indices = new Uint32Array(data.mesh.indices);
      updateComponent(id, {
        status: "validated",
        triangleCount: health.triangles,
        vertexCount: positions.length / 3,
        bounds: health.bounds,
        health,
        positions,
        indices,
        error: undefined,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Parsing failed";
      if (msg.toLowerCase().includes("non-finite") || msg.toLowerCase().includes("invalid coordinates")) {
        updateComponent(id, { status: "error", error: "Non-finite coordinates detected." });
      } else {
        updateComponent(id, { status: "error", error: msg });
      }
    }
  }

  function handleFiles(fileList: FileList | File[]) {
    setGlobalError(null);
    const files = Array.from(fileList);
    if (files.length === 0) return;
    if (components.length + files.length > MAX_COMPONENTS) {
      setGlobalError(`Too many components. Max ${MAX_COMPONENTS}.`);
      return;
    }
    const seen = new Set(components.map((c) => c.originalFilename.toLowerCase()));
    for (const file of files) {
      const lower = file.name.toLowerCase();
      if (seen.has(lower)) {
        const id = `cmp_${Math.random().toString(36).slice(2, 8)}`;
        addComponent({
          id,
          name: file.name.replace(/\.stl$/i, ""),
          originalFilename: file.name,
          triangleCount: 0,
          vertexCount: 0,
          bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 }, size: { x: 0, y: 0, z: 0 } },
          health: { triangles: 0, bodies: 0, openEdges: 0, bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 }, size: { x: 0, y: 0, z: 0 } }, hasFlippedFaces: false },
          units: projectUnits,
          status: "error",
          error: `Duplicate filename: ${file.name}`,
          positions: new Float32Array(0),
          indices: new Uint32Array(0),
        });
        continue;
      }
      seen.add(lower);
      const id = `cmp_${Math.random().toString(36).slice(2, 8)}`;
      addComponent({
        id,
        name: file.name.replace(/\.stl$/i, ""),
        originalFilename: file.name,
        triangleCount: 0,
        vertexCount: 0,
        bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 }, size: { x: 0, y: 0, z: 0 } },
        health: { triangles: 0, bodies: 0, openEdges: 0, bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 }, size: { x: 0, y: 0, z: 0 } }, hasFlippedFaces: false },
        units: projectUnits,
        status: "pending",
        positions: new Float32Array(0),
        indices: new Uint32Array(0),
      });
      validateFile(file, id);
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files);
  }

  function onBrowse(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files) handleFiles(e.target.files);
    e.target.value = "";
  }

  function retry(id: string) {
    const comp = components.find((c) => c.id === id);
    if (!comp) return;
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".stl";
    input.onchange = () => {
      const file = input.files?.[0];
      if (file) {
        updateComponent(id, { status: "pending", error: undefined });
        validateFile(file, id);
      }
    };
    input.click();
  }

  const validated = components.filter((c) => c.status === "validated").length;
  const errors = components.filter((c) => c.status === "error").length;

  return (
    <div className="multi-flow">
      <UnitSelector />
      <div
        className={`dropzone${dragOver ? " dropzone-drag" : ""}`}
        role="button"
        tabIndex={0}
        aria-label="Drop STL files here"
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); inputRef.current?.click(); } }}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
      >
        <UploadIcon size={28} />
        <div className="dropzone-title">Drop STL files here</div>
        <div className="dropzone-helper">Multiple STL — each file is a separate component. Up to {MAX_COMPONENTS} components, {MAX_FILE_BYTES / 1024 / 1024}MB each, {CHUNK_BYTES / 1024 / 1024}MB chunks.</div>
        <div className="dropzone-actions" onClick={(e) => e.stopPropagation()}>
          <button type="button" className="btn-secondary" onClick={() => inputRef.current?.click()}>Browse files</button>
        </div>
      </div>
      <input ref={inputRef} type="file" accept=".stl" multiple hidden onChange={onBrowse} />
      {globalError && <div role="alert" className="dropzone-error"><AlertIcon size={14} /> {globalError}</div>}
      <div className="import-summary">Total: {components.length} · Validated: {validated} · Errors: {errors}</div>
      <ComponentList components={components} onRemove={removeComponent} onRetry={retry} />
    </div>
  );
}
