import { describe, expect, test } from "bun:test";
import { app } from "../src/index.ts";
import { OUTWARD_CUBE, binaryStl } from "../../packages/core/tests/fixtures.ts";


const octet = { "content-type": "application/octet-stream" };


describe("POST /api/v1/mesh/validate", () => {

  test("rejects an empty body with 400", async () => {
    const res = await app.request("/api/v1/mesh/validate", { method: "POST", headers: octet, body: new ArrayBuffer(0) });
    expect(res.status).toBe(400);
  });

  test("rejects an invalid tolerance with 400", async () => {
    const res = await app.request("/api/v1/mesh/validate?tolerance=5", { method: "POST", headers: octet, body: binaryStl(OUTWARD_CUBE) });
    expect(res.status).toBe(400);
  });

  test("rejects text that is not an STL with 422", async () => {
    const body = new TextEncoder().encode("hello world, this is definitely not a mesh file at all...........................");
    const res = await app.request("/api/v1/mesh/validate", { method: "POST", headers: octet, body });
    expect(res.status).toBe(422);
    const json = await res.json() as { error: string };
    expect(json.error).toContain("STL");
  });

  test("returns health and mesh for a valid cube", async () => {
    const res = await app.request("/api/v1/mesh/validate", { method: "POST", headers: octet, body: binaryStl(OUTWARD_CUBE) });
    expect(res.status).toBe(200);
    const json = await res.json() as { health: { triangles: number; openEdges: number; nonManifold: number; flippedFaces: number }; mesh: { positions: number[]; indices: number[] }; repairable: boolean };
    expect(json.health.triangles).toBe(12);
    expect(json.health.openEdges).toBe(0);
    expect(json.health.nonManifold).toBe(0);
    expect(json.health.flippedFaces).toBe(0);
    expect(json.mesh.positions.length).toBe(8 * 3);
    expect(json.repairable).toBe(false);
  });

  test("accepts multipart uploads", async () => {
    const form = new FormData();
    form.append("file", new File([binaryStl(OUTWARD_CUBE)], "cube.stl"));
    const res = await app.request("/api/v1/mesh/validate", { method: "POST", body: form });
    expect(res.status).toBe(200);
  });

  test("MAX_TRIANGLES constant is defined and reasonable", async () => {
    const { MAX_TRIANGLES } = await import("@weld/core");
    expect(MAX_TRIANGLES).toBe(15_000_000);
  });
});


describe("POST /api/v1/mesh/repair", () => {

  test("returns stats and a binary STL", async () => {
    const res = await app.request("/api/v1/mesh/repair", { method: "POST", headers: octet, body: binaryStl(OUTWARD_CUBE.slice(0, 10)) });
    expect(res.status).toBe(200);
    const json = await res.json() as { stats: { closed: number }; health: { openEdges: number }; binaryBase64: string };
    expect(json.stats.closed).toBeGreaterThan(0);
    expect(json.health.openEdges).toBe(0);
    expect(json.binaryBase64.length).toBeGreaterThan(0);
  });
});
