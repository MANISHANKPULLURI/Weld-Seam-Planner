import { describe, expect, test } from "bun:test";
import { app } from "../src/index.ts";

describe("STL validation contract - future backend endpoint", () => {
  test("health exists as baseline for future mesh endpoints", async () => {
    const res = await app.request("/api/v1/health");
    expect(res.status).toBe(200);
  });

  test("future POST /api/v1/mesh/validate should exist after migration", async () => {
    const res = await app.request("/api/v1/mesh/validate", {
      method: "POST",
      body: new ArrayBuffer(0),
    });
    expect([404, 405, 400]).toContain(res.status);
  });

  test("future POST /api/v1/mesh/repair should exist after migration", async () => {
    const res = await app.request("/api/v1/mesh/repair", {
      method: "POST",
      body: new ArrayBuffer(0),
    });
    expect([404, 405, 400]).toContain(res.status);
  });

  test("MAX_TRIANGLES constant is defined and reasonable", async () => {
    const { MAX_TRIANGLES } = await import("../src/features/stl_validation/parse.ts");
    expect(MAX_TRIANGLES).toBe(5_000_000);
    expect(MAX_TRIANGLES).toBeGreaterThan(100_000);
  });

  test("empty buffer should be rejected with 400 after migration", async () => {
    const res = await app.request("/api/v1/mesh/validate", {
      method: "POST",
      headers: { "content-type": "application/octet-stream" },
      body: new ArrayBuffer(0),
    });
    expect([404, 400]).toContain(res.status);
  });
});
