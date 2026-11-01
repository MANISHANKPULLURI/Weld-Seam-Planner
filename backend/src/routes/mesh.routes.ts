import { Hono } from "hono";
import { z } from "zod";
import { MeshError } from "../features/mesh/types.ts";
import { runRepairPipeline, runValidationPipeline } from "../features/mesh/pipeline.ts";


const MAX_FILE_BYTES = 50 * 1024 * 1024;

export const meshRoutes = new Hono();


meshRoutes.post("/validate", async (c) => {

  const contentType = c.req.header("content-type") || "";

  let buffer: ArrayBuffer | null = null;

  if (contentType.includes("multipart/form-data")) {

    const form = await c.req.formData();

    const file = form.get("file");

    if (!(file instanceof File)) {
      return c.json({ error: "file field is required" }, 400);
    }

    if (file.size > MAX_FILE_BYTES) {
      return c.json({ error: "File too large. Max 50MB." }, 413);
    }

    buffer = await file.arrayBuffer();

  } else {

    const raw = await c.req.arrayBuffer();

    if (raw.byteLength === 0) {
      return c.json({ error: "Empty file" }, 400);
    }

    if (raw.byteLength > MAX_FILE_BYTES) {
      return c.json({ error: "File too large. Max 50MB." }, 413);
    }

    buffer = raw;
  }

  if (!buffer) {
    return c.json({ error: "Empty file" }, 400);
  }

  try {

    const result = runValidationPipeline(buffer);

    const positions = Array.from(result.welded.uniqueVertices);
    const indices = Array.from(result.welded.indexArray);

    return c.json({
      health: result.health,
      mesh: {
        positions,
        indices,
        triangles: result.health.triangles,
      },
      repairable: !result.health.isManifoldSolid,
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

  const contentType = c.req.header("content-type") || "";

  let buffer: ArrayBuffer | null = null;

  if (contentType.includes("multipart/form-data")) {

    const form = await c.req.formData();
    const file = form.get("file");

    if (!(file instanceof File)) {
      return c.json({ error: "file field is required" }, 400);
    }

    if (file.size > MAX_FILE_BYTES) {
      return c.json({ error: "File too large. Max 50MB." }, 413);
    }

    buffer = await file.arrayBuffer();

  } else {

    const raw = await c.req.arrayBuffer();

    if (raw.byteLength === 0) {
      return c.json({ error: "Empty file" }, 400);
    }

    if (raw.byteLength > MAX_FILE_BYTES) {
      return c.json({ error: "File too large. Max 50MB." }, 413);
    }

    buffer = raw;
  }

  if (!buffer) {
    return c.json({ error: "Empty file" }, 400);
  }

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

    const result = runRepairPipeline(buffer);

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

  const contentType = c.req.header("content-type") || "";
  let buffer: ArrayBuffer | null = null;

  if (contentType.includes("multipart/form-data")) {
    const form = await c.req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return c.json({ error: "file field is required" }, 400);
    if (file.size > MAX_FILE_BYTES) return c.json({ error: "File too large. Max 50MB." }, 413);
    buffer = await file.arrayBuffer();
  } else {
    const raw = await c.req.arrayBuffer();
    if (raw.byteLength === 0) return c.json({ error: "Empty file" }, 400);
    if (raw.byteLength > MAX_FILE_BYTES) return c.json({ error: "File too large. Max 50MB." }, 413);
    buffer = raw;
  }

  if (!buffer) return c.json({ error: "Empty file" }, 400);

  try {

    const result = runRepairPipeline(buffer);

    return new Response(result.binary, {
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
