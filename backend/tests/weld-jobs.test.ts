import { describe, expect, test } from "bun:test";
import { app } from "../src/index.ts";
import { EXAMPLE_PROCEDURES, defaultWeld, weldJobSchema } from "@weld/core";

const json = { "content-type": "application/json" };

describe("procedures and weld jobs", () => {
  test("GET /api/v1/procedures/presets returns the EXAMPLE procedures", async () => {
    const res = await app.request("/api/v1/procedures/presets");
    expect(res.status).toBe(200);
    expect((await res.json() as { procedures: unknown[] }).procedures.length).toBe(EXAMPLE_PROCEDURES.length);
  });

  test("POST /compile builds a sealed job that validates, and tampering is detected", async () => {
    const body = {
      meta: { name: "API job", createdAt: "2026-11-04T10:00:00.000Z", id: "job_api" },
      part: { filename: "p.stl", sha256: null, triangles: 12, min: [0, 0, 0], max: [100, 200, 60], repaired: false },
      units: "mm", upAxis: "+z", procedures: EXAMPLE_PROCEDURES,
      seams: [{ id: "s1", name: "S1", jointType: "fillet", angleDeg: 90, points: [45, 0, 10, 45, 200, 10], normalsA: [0, 0, 1, 0, 0, 1], normalsB: [1, 0, 0, 1, 0, 0], closed: false, weld: defaultWeld(EXAMPLE_PROCEDURES[0]!) }],
    };
    const res = await app.request("/api/v1/weld-jobs/compile", { method: "POST", headers: json, body: JSON.stringify(body) });
    expect(res.status).toBe(200);
    const job = await res.json() as { job: Record<string, unknown> };
    expect(weldJobSchema.safeParse(job).success).toBe(true);

    const ok = await (await app.request("/api/v1/weld-jobs/validate", { method: "POST", headers: json, body: JSON.stringify(job) })).json() as { valid: boolean; warnings: unknown[] };
    expect(ok.valid).toBe(true);
    expect(ok.warnings).toEqual([]);

    const tampered = { ...job, job: { ...job.job, name: "edited" } };
    const bad = await (await app.request("/api/v1/weld-jobs/validate", { method: "POST", headers: json, body: JSON.stringify(tampered) })).json() as { warnings: unknown[] };
    expect(bad.warnings.length).toBe(1);
  });

  test("POST /compile rejects bad input with 400", async () => {
    const res = await app.request("/api/v1/weld-jobs/compile", { method: "POST", headers: json, body: JSON.stringify({ meta: {} }) });
    expect(res.status).toBe(400);
  });
});
