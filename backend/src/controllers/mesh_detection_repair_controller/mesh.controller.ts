import { Hono } from "hono";
import type { Context } from "hono";
import { z } from "zod";
import { MeshError } from "./types.ts";
import { runRepairPipeline, runValidationPipeline } from "./pipeline.ts";
import { mkdir, writeFile, readFile, rm, readdir } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

const mb = Number(process.env.MAX_FILE_MB);
const maxMb = Number.isFinite(mb) && mb > 0 ? mb : 500;
const MAX_FILE_BYTES = maxMb * 1024 * 1024;
const CHUNK_BYTES = 5 * 1024 * 1024;
const UPLOAD_DIR = "/tmp/weld-uploads";
export const meshRoutes = new Hono();

async function getBuffer(c: Context): Promise<{ buffer: ArrayBuffer } | { error: string; status: 400 | 413 }> {
  const contentType = c.req.header("content-type") || "";
  if (contentType.includes("multipart/form-data")) {
    const form = await c.req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return { error: "file field is required", status: 400 };
    }
    if (file.size > MAX_FILE_BYTES) {
      return { error: `File too large. Max ${Math.floor(MAX_FILE_BYTES / 1024 / 1024)}MB.`, status: 413 };
    }
    const buffer = await file.arrayBuffer();
    if (buffer.byteLength === 0) {
      return { error: "Empty file", status: 400 };
    }
    if (buffer.byteLength > MAX_FILE_BYTES) {
      return { error: `File too large. Max ${Math.floor(MAX_FILE_BYTES / 1024 / 1024)}MB.`, status: 413 };
    }
    return { buffer };
  } else {
    const raw = await c.req.arrayBuffer();
    if (raw.byteLength === 0) {
      return { error: "Empty file", status: 400 };
    }
    if (raw.byteLength > MAX_FILE_BYTES) {
      return { error: `File too large. Max ${Math.floor(MAX_FILE_BYTES / 1024 / 1024)}MB.`, status: 413 };
    }
    return { buffer: raw };
  }
}

const getValidatedBuffer = getBuffer;

meshRoutes.post("/validate", async (c) => {
  const result = await getValidatedBuffer(c);
  if ("error" in result) {
    return c.json({ error: result.error }, result.status);
  }
  const buffer = result.buffer;
  const toleranceSchema = z.object({ tolerance: z.coerce.number().min(1e-9).max(1e-2).optional() });
  const tQ = toleranceSchema.safeParse({ tolerance: c.req.query("tolerance") });
  if (!tQ.success) return c.json({ error: "Invalid tolerance" }, 400);

  try {
    const pipelineResult = runValidationPipeline(buffer, tQ.data.tolerance ?? 1e-4);
    const positions = Array.from(pipelineResult.welded.uniqueVertices);
    const indices = Array.from(pipelineResult.welded.indexArray);
    return c.json({
      health: pipelineResult.health,
      mesh: {
        positions,
        indices,
        triangles: pipelineResult.health.triangles,
      },
      repairable: !pipelineResult.health.isManifoldSolid,
    });
  } catch (err) {
    if (err instanceof MeshError) {
      return c.json({ error: err.message }, 422);
    }
    if (err instanceof Error) {
      return c.json({ error: err.message }, 422);
    }
    return c.json({ error: "Invalid mesh" }, 422);
  }
});

meshRoutes.post("/repair", async (c) => {
  const validated = await getValidatedBuffer(c);
  if ("error" in validated) {
    return c.json({ error: validated.error }, validated.status);
  }
  const buffer = validated.buffer;

  const repairSchema = z.object({
    tolerance: z.coerce.number().min(1e-9).max(1e-2).optional(),
  });

  const query = repairSchema.safeParse({
    tolerance: c.req.query("tolerance"),
  });

  if (!query.success) {
    return c.json({ error: "Invalid tolerance" }, 400);
  }

  try {
    const result = runRepairPipeline(buffer, query.data.tolerance ?? 1e-4);
    const positions = Array.from(result.welded.uniqueVertices);
    const indices = Array.from(result.welded.indexArray);
    const binaryBase64 = Buffer.from(result.binary).toString("base64");
    return c.json({
      health: result.health,
      mesh: {
        positions,
        indices,
        triangles: result.health.triangles,
      },
      stats: result.stats,
      repaired: true,
      binaryBase64,
    });
  } catch (err) {
    if (err instanceof MeshError) {
      return c.json({ error: err.message }, 422);
    }
    if (err instanceof Error) {
      return c.json({ error: err.message }, 422);
    }
    return c.json({ error: "Repair failed" }, 422);
  }
});

meshRoutes.post("/repair/binary", async (c) => {
  const validated = await getValidatedBuffer(c);
  if ("error" in validated) {
    return c.json({ error: validated.error }, validated.status);
  }
  const buffer = validated.buffer;
  const repairBinarySchema = z.object({ tolerance: z.coerce.number().min(1e-9).max(1e-2).optional() });
  const q = repairBinarySchema.safeParse({ tolerance: c.req.query("tolerance") });
  if (!q.success) return c.json({ error: "Invalid tolerance" }, 400);

  try {
    const result = runRepairPipeline(buffer, q.data.tolerance ?? 1e-4);
    return new Response(result.binary as any, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": 'attachment; filename="repaired.stl"',
      },
    });
  } catch (err) {
    if (err instanceof MeshError) return c.json({ error: err.message }, 422);
    return c.json({ error: "Repair failed" }, 422);
  }
});

meshRoutes.post("/upload/init", async (c) => {
  const body = (await c.req.json().catch(() => null)) as { fileName?: string; fileSize?: number } | null;

  if (!body || typeof body.fileSize !== "number") {
    return c.json({ error: "fileSize required" }, 400);
  }

  if (body.fileSize > MAX_FILE_BYTES) {
    return c.json({ error: `File too large. Max ${Math.floor(MAX_FILE_BYTES / 1024 / 1024)}MB.` }, 413);
  }

  const uploadId = randomUUID();
  await mkdir(join(UPLOAD_DIR, uploadId), { recursive: true });
  return c.json({ uploadId, chunkSize: CHUNK_BYTES });
});

meshRoutes.post("/upload/:id/chunk", async (c) => {
  const id = c.req.param("id");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return c.json({ error: "Invalid upload id" }, 400);
  const indexStr = c.req.query("index");
  const index = Number(indexStr);
  if (!Number.isInteger(index) || index < 0 || index > 10000) return c.json({ error: "Invalid index" }, 400);

  const chunk = await c.req.arrayBuffer();

  if (chunk.byteLength === 0) {
    return c.json({ error: "Empty chunk" }, 400);
  }

  if (chunk.byteLength > CHUNK_BYTES + 1024) {
    return c.json({ error: "Chunk too large" }, 413);
  }

  const dir = join(UPLOAD_DIR, id);
  const path = join(dir, `${index}.part`);

  await mkdir(dir, { recursive: true });
  await writeFile(path, Buffer.from(chunk));

  return c.json({ ok: true, index });
});

meshRoutes.post("/upload/:id/complete", async (c) => {
  const id = c.req.param("id");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return c.json({ error: "Invalid upload id" }, 400);
  const mode = c.req.query("mode") || "validate";

  const dir = join(UPLOAD_DIR, id);

  let files: string[] = [];

  try {
    files = await readdir(dir);
  } catch {
    return c.json({ error: "Upload not found" }, 404);
  }

  const parts = files.filter((f) => f.endsWith(".part")).sort((a, b) => Number(a.split(".")[0]) - Number(b.split(".")[0]));

  if (parts.length === 0) return c.json({ error: "No chunks" }, 400);

  const buffers: Buffer[] = [];

  for (const p of parts) {
    const buf = await readFile(join(dir, p));
    buffers.push(buf);
  }

  const assembled = Buffer.concat(buffers);

  if (assembled.byteLength > MAX_FILE_BYTES) {
    await rm(dir, { recursive: true, force: true });
    return c.json({ error: `File too large. Max ${Math.floor(MAX_FILE_BYTES / 1024 / 1024)}MB.` }, 413);
  }

  const buffer = assembled.buffer.slice(assembled.byteOffset, assembled.byteOffset + assembled.byteLength) as ArrayBuffer;

  const toleranceSchema = z.object({ tolerance: z.coerce.number().min(1e-9).max(1e-2).optional() });
  const tQ = toleranceSchema.safeParse({ tolerance: c.req.query("tolerance") });
  if (!tQ.success) {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
    return c.json({ error: "Invalid tolerance" }, 400);
  }
  const tol = tQ.data.tolerance ?? 1e-4;
  try {
    if (mode === "repair") {
      const result = runRepairPipeline(buffer, tol);
      const positions = Array.from(result.welded.uniqueVertices);
      const indices = Array.from(result.welded.indexArray);
      const binaryBase64 = Buffer.from(result.binary).toString("base64");
      await rm(dir, { recursive: true, force: true });
      return c.json({
        health: result.health,
        mesh: { positions, indices, triangles: result.health.triangles },
        stats: result.stats,
        repaired: true,
        binaryBase64,
      });
    }

    const result = runValidationPipeline(buffer, tol);
    const positions = Array.from(result.welded.uniqueVertices);
    const indices = Array.from(result.welded.indexArray);
    await rm(dir, { recursive: true, force: true });
    return c.json({
      health: result.health,
      mesh: { positions, indices, triangles: result.health.triangles },
      repairable: !result.health.isManifoldSolid,
    });
  } catch (err) {
    await rm(dir, { recursive: true, force: true }).catch(() => {});

    if (err instanceof MeshError) return c.json({ error: err.message }, 422);
    if (err instanceof Error) return c.json({ error: err.message }, 422);
    return c.json({ error: "Processing failed" }, 422);
  }
});
