import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, utimes } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { app } from "../src/index.ts";
import { CHUNK_BYTES, UPLOAD_DIR, sweepExpiredUploads } from "../src/controllers/mesh_detection_repair_controller/mesh.controller.ts";
import { OUTWARD_CUBE, binaryStl } from "../../packages/core/tests/fixtures.ts";


/**
 * start a test chunked upload session
 */
async function init(fileSize: number) {
  const res = await app.request("/api/v1/mesh/upload/init", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ fileSize }) });
  return { res, json: await res.json() as { uploadId: string; chunkSize: number } };
}


/**
 * post a test chunk for an upload
 */
function chunk(id: string, index: string, body: ArrayBuffer | Uint8Array) {
  return app.request(`/api/v1/mesh/upload/${id}/chunk?index=${index}`, { method: "POST", body });
}


describe("chunked upload", () => {

  test("init rejects a missing or invalid fileSize", async () => {
    expect((await init(0)).res.status).toBe(400);
    expect((await init(-5)).res.status).toBe(400);
  });

  test("rejects a path traversal chunk index without writing outside the upload dir", async () => {
    const { json } = await init(10);
    const res = await chunk(json.uploadId, "..%2F..%2Fweld-escape-probe", new Uint8Array([1, 2, 3]));
    expect(res.status).toBe(400);
    expect(existsSync(join(UPLOAD_DIR, "..", "weld-escape-probe.part"))).toBe(false);
  });

  test("rejects a malformed upload id", async () => {
    expect((await chunk("not-a-uuid", "0", new Uint8Array([1]))).status).toBe(400);
    const complete = await app.request("/api/v1/mesh/upload/..%2F..%2Fetc/complete", { method: "POST" });
    expect([400, 404]).toContain(complete.status);
  });

  test("rejects a chunk index beyond the declared size", async () => {
    const { json } = await init(10);
    expect((await chunk(json.uploadId, "1", new Uint8Array([1]))).status).toBe(400);
  });

  test("returns 404 for an unknown upload", async () => {
    expect((await chunk(randomUUID(), "0", new Uint8Array([1]))).status).toBe(404);
  });

  test("reports a missing chunk on complete", async () => {
    const { json } = await init(CHUNK_BYTES + 10);
    await chunk(json.uploadId, "0", new Uint8Array(CHUNK_BYTES));
    const res = await app.request(`/api/v1/mesh/upload/${json.uploadId}/complete`, { method: "POST" });
    expect(res.status).toBe(400);
    expect((await res.json() as { error: string }).error).toContain("Missing chunk 1");
  });

  test("rejects a size mismatch on complete", async () => {
    const { json } = await init(100);
    await chunk(json.uploadId, "0", new Uint8Array(50));
    const res = await app.request(`/api/v1/mesh/upload/${json.uploadId}/complete`, { method: "POST" });
    expect(res.status).toBe(400);
  });

  test("validates a complete upload and cleans up", async () => {
    const stl = binaryStl(OUTWARD_CUBE);
    const { json } = await init(stl.byteLength);
    expect((await chunk(json.uploadId, "0", stl)).status).toBe(200);
    const res = await app.request(`/api/v1/mesh/upload/${json.uploadId}/complete?mode=validate`, { method: "POST" });
    expect(res.status).toBe(200);
    expect((await res.json() as { health: { triangles: number } }).health.triangles).toBe(12);
    expect(existsSync(join(UPLOAD_DIR, json.uploadId))).toBe(false);
  });

  test("sweeps expired upload directories", async () => {
    const id = randomUUID();
    const dir = join(UPLOAD_DIR, id);
    await mkdir(dir, { recursive: true });
    const old = new Date(Date.now() - 2 * 60 * 60 * 1000);
    await utimes(dir, old, old);
    await sweepExpiredUploads();
    expect(existsSync(dir)).toBe(false);
  });
});
