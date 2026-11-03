import { Hono } from "hono";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { MeshError } from "../mesh_detection_repair_controller/types.ts";
import { runValidationPipeline } from "../mesh_detection_repair_controller/pipeline.ts";
import type { ComponentMetadata, ProjectUnits } from "./types.ts";
import { MAX_FILE_BYTES, MAX_COMPONENTS, SUPPORTED_EXTENSIONS } from "./limits.ts";

export const projectRoutes = new Hono();

const singleValidateSchema = z.object({
  units: z.enum(["mm", "inch"]).optional(),
});

const batchValidateSchema = z.object({
  units: z.enum(["mm", "inch"]).optional(),
});

function validateFilename(name: string): string | null {
  const lower = name.toLowerCase();
  if (!SUPPORTED_EXTENSIONS.some((ext) => lower.endsWith(ext))) return "Unsupported file format. Only .stl is supported.";
  if (name.length > 255) return "Filename too long.";
  return null;
}

function toComponentMeta(
  id: string,
  filename: string,
  buffer: ArrayBuffer,
  units: ProjectUnits,
): ComponentMetadata {
  const result = runValidationPipeline(buffer);
  return {
    id,
    name: filename.replace(/\.stl$/i, ""),
    originalFilename: filename,
    triangleCount: result.health.triangles,
    vertexCount: result.welded.uniqueVertices.length / 3,
    bounds: result.health.bounds,
    health: result.health,
    units,
    status: "validated",
  };
}

projectRoutes.post("/validate-single", async (c) => {
  const contentType = c.req.header("content-type") || "";
  let buffer: ArrayBuffer | null = null;
  let filename = "component.stl";
  let units: ProjectUnits = "mm";
  const q = singleValidateSchema.safeParse({ units: c.req.query("units") });
  if (q.success && q.data.units) units = q.data.units;

  if (contentType.includes("multipart/form-data")) {
    const form = await c.req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return c.json({ error: "file field is required" }, 400);
    const err = validateFilename(file.name);
    if (err) return c.json({ error: err }, 400);
    if (file.size === 0) return c.json({ error: "Empty file" }, 400);
    if (!Number.isFinite(file.size) || file.size > MAX_FILE_BYTES) return c.json({ error: `File too large. Max ${MAX_FILE_BYTES / 1024 / 1024}MB.` }, 413);
    filename = file.name;
    buffer = await file.arrayBuffer();
  } else {
    const raw = await c.req.arrayBuffer();
    if (raw.byteLength === 0) return c.json({ error: "Empty file" }, 400);
    if (raw.byteLength > MAX_FILE_BYTES) return c.json({ error: `File too large. Max ${MAX_FILE_BYTES / 1024 / 1024}MB.` }, 413);
    buffer = raw;
    const hdr = c.req.header("x-filename");
    if (hdr) filename = hdr;
  }
  if (!buffer) return c.json({ error: "Empty file" }, 400);
  const lower = filename.toLowerCase();
  if (!SUPPORTED_EXTENSIONS.some((ext) => lower.endsWith(ext))) {
    if (!lower.endsWith(".stl")) filename = `${filename}.stl`;
  }
  if (buffer.byteLength === 0) return c.json({ error: "Empty file" }, 400);

  try {
    const id = `cmp_${randomUUID().slice(0, 8)}`;
    const meta = toComponentMeta(id, filename, buffer, units);
    const positions = Array.from(new Float32Array([]));
    void positions;
    return c.json({ component: meta, units, inputMode: "single" as const });
  } catch (err) {
    if (err instanceof MeshError) return c.json({ error: err.message }, 422);
    if (err instanceof Error) {
      if (err.message.includes("invalid coordinates") || err.message.includes("Non-finite")) return c.json({ error: "Non-finite coordinates detected." }, 422);
      return c.json({ error: err.message }, 422);
    }
    return c.json({ error: "Invalid STL data" }, 422);
  }
});

projectRoutes.post("/validate-batch", async (c) => {
  const q = batchValidateSchema.safeParse({ units: c.req.query("units") });
  const units: ProjectUnits = q.success && q.data.units ? q.data.units : "mm";
  const contentType = c.req.header("content-type") || "";
  let files: File[] = [];
  if (contentType.includes("multipart/form-data")) {
    const form = await c.req.formData();
    const all = form.getAll("files") as unknown as File[];
    const single = form.get("file");
    if (all.length > 0) {
      files = (all.filter((f: unknown) => f instanceof File) as File[]);
    } else if (single instanceof File) {
      files = [single];
    } else {
      const entries = (Array.from(form.values()) as unknown[]).filter((v: unknown) => v instanceof File) as File[];
      files = entries;
    }
    if (files.length === 0) {
      const maybe = form.getAll("file") as unknown[];
      files = (maybe.filter((f: unknown) => f instanceof File) as File[]);
    }
  } else {
    return c.json({ error: "multipart/form-data with files[] required" }, 400);
  }
  if (files.length === 0) return c.json({ error: "No files provided" }, 400);
  if (files.length > MAX_COMPONENTS) return c.json({ error: `Too many files. Max ${MAX_COMPONENTS} components.` }, 400);

  const seen = new Set<string>();
  const results: Array<{ filename: string; status: "validated" | "error"; component?: ComponentMetadata; error?: string }> = [];

  for (const file of files) {
    const lower = file.name.toLowerCase();
    const dupErr = seen.has(lower) ? `Duplicate filename: ${file.name}` : null;
    if (dupErr) {
      results.push({ filename: file.name, status: "error", error: dupErr });
      continue;
    }
    seen.add(lower);
    const fmtErr = validateFilename(file.name);
    if (fmtErr) {
      results.push({ filename: file.name, status: "error", error: fmtErr });
      continue;
    }
    if (file.size === 0) {
      results.push({ filename: file.name, status: "error", error: "Empty file" });
      continue;
    }
    if (file.size > MAX_FILE_BYTES) {
      results.push({ filename: file.name, status: "error", error: `File too large. Max ${MAX_FILE_BYTES / 1024 / 1024}MB.` });
      continue;
    }
    try {
      const buf = await file.arrayBuffer();
      if (buf.byteLength === 0) throw new Error("Empty file");
      const id = `cmp_${randomUUID().slice(0, 8)}`;
      const meta = toComponentMeta(id, file.name, buf, units);
      results.push({ filename: file.name, status: "validated", component: meta });
    } catch (err) {
      const msg = err instanceof MeshError ? err.message : err instanceof Error ? err.message : "Parsing failed";
      if (msg.toLowerCase().includes("invalid coordinates") || msg.toLowerCase().includes("non-finite")) {
        results.push({ filename: file.name, status: "error", error: "Non-finite coordinates detected." });
      } else {
        results.push({ filename: file.name, status: "error", error: msg });
      }
    }
  }

  const validated = results.filter((r) => r.status === "validated").length;
  const errors = results.filter((r) => r.status === "error").length;
  return c.json({ inputMode: "multiple" as const, units, results, summary: { total: files.length, validated, errors } });
});

projectRoutes.post("/create", async (c) => {
  const body = await c.req.json().catch(() => null) as { inputMode?: string; units?: string; name?: string } | null;
  if (!body || !body.inputMode || !["single", "multiple"].includes(body.inputMode)) {
    return c.json({ error: "inputMode single|multiple required" }, 400);
  }
  if (body.units && !["mm", "inch"].includes(body.units)) return c.json({ error: "Invalid units" }, 400);
  const id = `proj_${randomUUID().slice(0, 8)}`;
  return c.json({ project: { id, inputMode: body.inputMode, units: (body.units as ProjectUnits) ?? "mm", name: body.name ?? id, createdAt: new Date().toISOString() } });
});
