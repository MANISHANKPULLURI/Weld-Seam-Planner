import type { Context, Env } from "hono";
import { z } from "zod";
import { analyseMesh, repairMesh, writeBinaryStl } from "@weld/core";
import type { AnalysedMesh } from "@weld/core";
import { mkdir, writeFile, readFile, readdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { config } from "../../config.ts";
import { CHUNK_BYTES as SHARED_CHUNK_BYTES, UPLOAD_SWEEP_INTERVAL_MS } from "../../constants.ts";


export const MAX_FILE_BYTES = config.maxFileBytes;


export const CHUNK_BYTES: number = SHARED_CHUNK_BYTES;
export const UPLOAD_DIR = config.uploadDir;

const UPLOAD_TTL_MS = config.uploadTtlMs;
const SWEEP_INTERVAL_MS = UPLOAD_SWEEP_INTERVAL_MS;
const UPLOAD_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const CHUNK_INDEX_PATTERN = /^\d{1,6}$/;

const toleranceSchema = z.coerce.number().min(1e-9).max(1e-2).optional();

type UploadMeta = { fileSize: number; totalChunks: number; createdAt: number };


/**
 * build file-too-large error message
 */
function tooLarge() {
  return `File too large. Max ${Math.floor(MAX_FILE_BYTES / 1024 / 1024)}MB.`;
}


/**
 * read mesh bytes from multipart or raw body
 */
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


/**
 * undefined means "use the size-relative default"; null means the query value was invalid.
 * parse optional tolerance query param
 */
function readTolerance(c: Context): number | undefined | null {

  const parsed = toleranceSchema.safeParse(c.req.query("tolerance"));

  return parsed.success ? parsed.data : null;
}


/**
 * analyse mesh and return health report
 */
function runValidation(buffer: ArrayBuffer, tolerance: number | undefined) {
  return analyseMesh(buffer, { tolerance });
}


/**
 * analyse mesh and build repaired result
 */
function runRepair(buffer: ArrayBuffer, tolerance: number | undefined) {
  const analysed = analyseMesh(buffer, { tolerance });
  const repaired = repairMesh(analysed.vertices, analysed.orientedIndices, analysed.health);
  return { analysed, repaired, binary: writeBinaryStl(analysed.vertices, repaired.indices) };
}


/**
 * log mesh error and return fallback response
 */
function meshErrorResponse(c: Context, err: unknown, fallback: string) {

  console.error(`mesh ${c.req.path} failed:`, err);

  return c.json({ error: fallback }, 422);
}


/**
 * shape analysed mesh into validate response
 */
function validationBody(result: AnalysedMesh) {
  return {
    health: result.health,
    format: result.format,
    warnings: result.warnings,
    mesh: {
      positions: Array.from(result.vertices),
      indices: Array.from(result.indices),
      triangles: result.health.triangles,
    },
    repairable: !result.health.isManifoldSolid || result.health.flippedFaces > 0,
  };
}


/**
 * shape repaired mesh into repair response
 */
function repairBody(result: ReturnType<typeof runRepair>) {
  return {
    health: result.repaired.health,
    mesh: {
      positions: Array.from(result.analysed.vertices),
      indices: Array.from(result.repaired.indices),
      triangles: result.repaired.health.triangles,
    },
    stats: result.repaired.stats,
    repaired: true,
    binaryBase64: Buffer.from(result.binary).toString("base64"),
  };
}


/**
 * Shared preamble for /validate, /repair and /repair/binary: tolerance parsing,
 * body loading, and generic (non-leaking) error mapping.
 * load tolerance and body then run mesh handler
 */
async function withMesh(
  c: Context,
  fallback: string,
  handle: (buffer: ArrayBuffer, tolerance: number | undefined) => Response | Promise<Response>,
): Promise<Response> {

  const tolerance = readTolerance(c);
  if (tolerance === null) return c.json({ error: "Invalid tolerance" }, 400);

  const buffer = await readMeshBody(c);
  if (buffer instanceof Response) return buffer;

  try {
    return await handle(buffer, tolerance);
  } catch (err) {
    return meshErrorResponse(c, err, fallback);
  }
}


/**
 * handle POST mesh validate request
 */
export async function handleValidateMesh(c: Context): Promise<Response> {
  return withMesh(c, "Invalid mesh", (buffer, tolerance) => c.json(validationBody(runValidation(buffer, tolerance))));
}


/**
 * handle POST mesh repair request
 */
export async function handleRepairMesh(c: Context): Promise<Response> {
  return withMesh(c, "Repair failed", (buffer, tolerance) => c.json(repairBody(runRepair(buffer, tolerance))));
}


/**
 * handle POST mesh repair binary download
 */
export async function handleRepairMeshBinary(c: Context): Promise<Response> {
  return withMesh(c, "Repair failed", (buffer, tolerance) => {

    const result = runRepair(buffer, tolerance);

    return new Response(result.binary, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": 'attachment; filename="repaired.stl"',
      },
    });
  });
}


const uploadMetaSchema = z.object({
  fileSize: z.number().int().positive().max(MAX_FILE_BYTES),
  totalChunks: z.number().int().positive().max(Math.ceil(MAX_FILE_BYTES / CHUNK_BYTES) + 1),
  createdAt: z.number().finite(),
});

/**
 * read and validate chunked upload metadata
 */
async function readUploadMeta(id: string): Promise<UploadMeta | null> {

  try {
    const parsed = uploadMetaSchema.safeParse(JSON.parse(await readFile(join(UPLOAD_DIR, id, "meta.json"), "utf-8")));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}


/**
 * handle chunked upload initialisation
 */
export async function handleUploadInit(c: Context): Promise<Response> {

  const body = await c.req.json().catch(() => null) as { fileName?: string; fileSize?: number } | null;

  if (!body || typeof body.fileSize !== "number" || !Number.isInteger(body.fileSize) || body.fileSize <= 0) {
    return c.json({ error: "fileSize required" }, 400);
  }

  if (body.fileSize > MAX_FILE_BYTES) return c.json({ error: tooLarge() }, 413);

  const uploadId = randomUUID();
  const meta: UploadMeta = { fileSize: body.fileSize, totalChunks: Math.ceil(body.fileSize / CHUNK_BYTES), createdAt: Date.now() };

  await mkdir(join(UPLOAD_DIR, uploadId), { recursive: true });
  await writeFile(join(UPLOAD_DIR, uploadId, "meta.json"), JSON.stringify(meta));

  return c.json({ uploadId, chunkSize: CHUNK_BYTES, expiresAt: meta.createdAt + UPLOAD_TTL_MS });
}


/**
 * handle single chunked upload part
 */
export async function handleUploadChunk(c: Context<Env, "/upload/:id/chunk">): Promise<Response> {

  const id = c.req.param("id");
  const indexParam = c.req.query("index") ?? "";

  if (!UPLOAD_ID_PATTERN.test(id)) return c.json({ error: "Invalid upload id" }, 400);
  if (!CHUNK_INDEX_PATTERN.test(indexParam)) return c.json({ error: "Invalid chunk index" }, 400);

  const meta = await readUploadMeta(id);
  if (!meta) return c.json({ error: "Upload not found" }, 404);

  const index = Number(indexParam);
  if (index >= meta.totalChunks) return c.json({ error: "Invalid chunk index" }, 400);

  const partPath = join(UPLOAD_DIR, id, `${index}.part`);

  if (await stat(partPath).then(() => true).catch(() => false)) {
    return c.json({ error: "Chunk already received" }, 409);
  }

  const chunk = await c.req.arrayBuffer();

  if (chunk.byteLength === 0) return c.json({ error: "Empty chunk" }, 400);

  const expectedSize = index < meta.totalChunks - 1 ? CHUNK_BYTES : meta.fileSize - index * CHUNK_BYTES;
  if (chunk.byteLength !== expectedSize) return c.json({ error: "Invalid chunk size" }, 400);

  await writeFile(partPath, Buffer.from(chunk));

  return c.json({ ok: true, index });
}


/**
 * assemble chunks and validate or repair
 */
export async function handleCompleteUpload(c: Context<Env, "/upload/:id/complete">): Promise<Response> {

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
      await rm(dir, { recursive: true, force: true }).catch(() => {});
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
    const body = mode === "repair" ? repairBody(runRepair(buffer, tolerance)) : validationBody(runValidation(buffer, tolerance));
    return c.json(body);
  } catch (err) {
    return meshErrorResponse(c, err, "Processing failed");
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}


/**
 * remove expired chunked upload directories
 */
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
