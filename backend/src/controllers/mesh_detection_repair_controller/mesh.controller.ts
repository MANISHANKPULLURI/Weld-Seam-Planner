import { Hono } from "hono";
import type { Context } from "hono";
import { z } from "zod";
import { MeshError } from "./types.ts";
import { DEFAULT_WELD_TOLERANCE, runRepairPipeline, runValidationPipeline } from "./pipeline.ts";
import { mkdir, writeFile, readFile, readdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";


export const MAX_FILE_BYTES = Number(process.env.MAX_FILE_MB || 500) * 1024 * 1024;
export const CHUNK_BYTES = 5 * 1024 * 1024;
export const UPLOAD_DIR = process.env.UPLOAD_DIR || join(tmpdir(), "weld-uploads");

const UPLOAD_TTL_MS = Number(process.env.UPLOAD_TTL_MIN || 30) * 60 * 1000;
const SWEEP_INTERVAL_MS = 10 * 60 * 1000;
const UPLOAD_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const CHUNK_INDEX_PATTERN = /^\d{1,6}$/;

const toleranceSchema = z.coerce.number().min(1e-9).max(1e-2).optional();

type UploadMeta = { fileSize: number; totalChunks: number; createdAt: number };

export const meshRoutes = new Hono();


function tooLarge() {
  return `File too large. Max ${Math.floor(MAX_FILE_BYTES / 1024 / 1024)}MB.`;
}


async function readMeshBody(c: Context): Promise<ArrayBuffer | Response> {

  const contentType = c.req.header("content-type") || "";

  if (contentType.includes("multipart/form-data")) {

    const form = await c.req.formData();
    const file = form.get("file");

    if (!(file instanceof File)) return c.json({ error: "file field is required" }, 400);
    if (file.size === 0) return c.json({ error: "Empty file" }, 400);
    if (file.size > MAX_FILE_BYTES) return c.json({ error: tooLarge() }, 413);

    return await file.arrayBuffer();
  }

  const raw = await c.req.arrayBuffer();

  if (raw.byteLength === 0) return c.json({ error: "Empty file" }, 400);
  if (raw.byteLength > MAX_FILE_BYTES) return c.json({ error: tooLarge() }, 413);

  return raw;
}


function readTolerance(c: Context): number | null {

  const parsed = toleranceSchema.safeParse(c.req.query("tolerance"));

  if (!parsed.success) return null;

  return parsed.data ?? DEFAULT_WELD_TOLERANCE;
}


function meshErrorResponse(c: Context, err: unknown, fallback: string) {

  if (err instanceof MeshError || err instanceof Error) return c.json({ error: err.message }, 422);

  return c.json({ error: fallback }, 422);
}


function validationBody(result: ReturnType<typeof runValidationPipeline>) {
  return {
    health: result.health,
    mesh: {
      positions: Array.from(result.welded.uniqueVertices),
      indices: Array.from(result.welded.indexArray),
      triangles: result.health.triangles,
    },
    repairable: !result.health.isManifoldSolid || result.health.flippedFaces > 0,
  };
}


function repairBody(result: ReturnType<typeof runRepairPipeline>) {
  return {
    health: result.health,
    mesh: {
      positions: Array.from(result.welded.uniqueVertices),
      indices: Array.from(result.welded.indexArray),
      triangles: result.health.triangles,
    },
    stats: result.stats,
    repaired: true,
    binaryBase64: Buffer.from(result.binary).toString("base64"),
  };
}


meshRoutes.post("/validate", async (c) => {

  const tolerance = readTolerance(c);
  if (tolerance === null) return c.json({ error: "Invalid tolerance" }, 400);

  const buffer = await readMeshBody(c);
  if (buffer instanceof Response) return buffer;

  try {
    return c.json(validationBody(runValidationPipeline(buffer, tolerance)));
  } catch (err) {
    return meshErrorResponse(c, err, "Invalid mesh");
  }
});


meshRoutes.post("/repair", async (c) => {

  const tolerance = readTolerance(c);
  if (tolerance === null) return c.json({ error: "Invalid tolerance" }, 400);

  const buffer = await readMeshBody(c);
  if (buffer instanceof Response) return buffer;

  try {
    return c.json(repairBody(runRepairPipeline(buffer, tolerance)));
  } catch (err) {
    return meshErrorResponse(c, err, "Repair failed");
  }
});


meshRoutes.post("/repair/binary", async (c) => {

  const tolerance = readTolerance(c);
  if (tolerance === null) return c.json({ error: "Invalid tolerance" }, 400);

  const buffer = await readMeshBody(c);
  if (buffer instanceof Response) return buffer;

  try {

    const result = runRepairPipeline(buffer, tolerance);

    return new Response(result.binary, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": 'attachment; filename="repaired.stl"',
      },
    });

  } catch (err) {
    return meshErrorResponse(c, err, "Repair failed");
  }
});


async function readUploadMeta(id: string): Promise<UploadMeta | null> {

  try {
    return JSON.parse(await readFile(join(UPLOAD_DIR, id, "meta.json"), "utf-8")) as UploadMeta;
  } catch {
    return null;
  }
}


meshRoutes.post("/upload/init", async (c) => {

  const body = await c.req.json().catch(() => null) as { fileName?: string; fileSize?: number } | null;

  if (!body || typeof body.fileSize !== "number" || !Number.isInteger(body.fileSize) || body.fileSize <= 0) {
    return c.json({ error: "fileSize required" }, 400);
  }

  if (body.fileSize > MAX_FILE_BYTES) return c.json({ error: tooLarge() }, 413);

  const uploadId = randomUUID();
  const meta: UploadMeta = { fileSize: body.fileSize, totalChunks: Math.ceil(body.fileSize / CHUNK_BYTES), createdAt: Date.now() };

  await mkdir(join(UPLOAD_DIR, uploadId), { recursive: true });
  await writeFile(join(UPLOAD_DIR, uploadId, "meta.json"), JSON.stringify(meta));

  return c.json({ uploadId, chunkSize: CHUNK_BYTES });
});


meshRoutes.post("/upload/:id/chunk", async (c) => {

  const id = c.req.param("id");
  const indexParam = c.req.query("index") ?? "";

  if (!UPLOAD_ID_PATTERN.test(id)) return c.json({ error: "Invalid upload id" }, 400);
  if (!CHUNK_INDEX_PATTERN.test(indexParam)) return c.json({ error: "Invalid chunk index" }, 400);

  const meta = await readUploadMeta(id);
  if (!meta) return c.json({ error: "Upload not found" }, 404);

  const index = Number(indexParam);
  if (index >= meta.totalChunks) return c.json({ error: "Invalid chunk index" }, 400);

  const chunk = await c.req.arrayBuffer();

  if (chunk.byteLength === 0) return c.json({ error: "Empty chunk" }, 400);
  if (chunk.byteLength > CHUNK_BYTES) return c.json({ error: "Chunk too large" }, 413);

  await writeFile(join(UPLOAD_DIR, id, `${index}.part`), Buffer.from(chunk));

  return c.json({ ok: true, index });
});


meshRoutes.post("/upload/:id/complete", async (c) => {

  const id = c.req.param("id");
  const mode = c.req.query("mode") || "validate";

  if (!UPLOAD_ID_PATTERN.test(id)) return c.json({ error: "Invalid upload id" }, 400);
  if (mode !== "validate" && mode !== "repair") return c.json({ error: "Invalid mode" }, 400);

  const tolerance = readTolerance(c);
  if (tolerance === null) return c.json({ error: "Invalid tolerance" }, 400);

  const meta = await readUploadMeta(id);
  if (!meta) return c.json({ error: "Upload not found" }, 404);

  const dir = join(UPLOAD_DIR, id);
  const buffers: Buffer[] = [];

  for (let i = 0; i < meta.totalChunks; i++) {
    try {
      buffers.push(await readFile(join(dir, `${i}.part`)));
    } catch {
      return c.json({ error: `Missing chunk ${i}` }, 400);
    }
  }

  const assembled = Buffer.concat(buffers);

  if (assembled.byteLength !== meta.fileSize) {
    await rm(dir, { recursive: true, force: true });
    return c.json({ error: "Uploaded size does not match the declared file size" }, 400);
  }

  const buffer = assembled.buffer.slice(assembled.byteOffset, assembled.byteOffset + assembled.byteLength) as ArrayBuffer;

  try {
    const body = mode === "repair" ? repairBody(runRepairPipeline(buffer, tolerance)) : validationBody(runValidationPipeline(buffer, tolerance));
    return c.json(body);
  } catch (err) {
    return meshErrorResponse(c, err, "Processing failed");
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
});


export async function sweepExpiredUploads(now = Date.now(), ttlMs = UPLOAD_TTL_MS) {

  let removed = 0;
  let entries: string[] = [];

  try {
    entries = await readdir(UPLOAD_DIR);
  } catch {
    return removed;
  }

  for (const entry of entries) {

    if (!UPLOAD_ID_PATTERN.test(entry)) continue;

    const dir = join(UPLOAD_DIR, entry);
    const info = await stat(dir).catch(() => null);

    if (info && now - info.mtimeMs > ttlMs) {
      await rm(dir, { recursive: true, force: true }).catch(() => {});
      removed++;
    }
  }

  return removed;
}


setInterval(() => { void sweepExpiredUploads(); }, SWEEP_INTERVAL_MS).unref();
