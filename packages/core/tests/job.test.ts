import { describe, expect, test } from "bun:test";
import { EXAMPLE_PROCEDURES, airTravel, compileWeldJob, defaultWeld, measure, planOrder, sealWeldJob, torchFrame, verifyWeldJob, weldJobSchema } from "../src/index.ts";
import type { JobInput } from "../src/index.ts";

type P = [number, number, number];
/**
 * build a straight measured seam between two points with normals
 */
const line = (a: P, b: P, nA: P = [0, 0, 1], nB: P = [1, 0, 0]) => measure({ points: new Float32Array([...a, ...b]), normalsA: new Float32Array([...nA, ...nA]), normalsB: new Float32Array([...nB, ...nB]), closed: false, length: 0 });

describe("sequence planning", () => {
  test("orders and flips seams to cut air travel", () => {
    
    const seams = [0, 20, 10].map((x) => ({ start: [x, 0, 0] as P, end: [x, 100, 0] as P, closed: false }));
    const naive = airTravel(seams, [0, 1, 2], [false, false, false]);
    const plan = planOrder(seams);
    expect(plan.order).toEqual([0, 2, 1]);
    expect(plan.reversed[2]).toBe(true);
    expect(plan.airMm).toBeCloseTo(20, 6);
    expect(plan.airMm).toBeLessThan(naive);
  });

  test("2-opt finds a better tour than nearest neighbour alone", () => {
    const pts: P[] = [[0, 0, 0], [10, 0, 0], [20, 0, 0], [20, 10, 0], [10, 10, 0], [0, 10, 0], [30, 5, 0]];
    const seams = pts.map((p) => ({ start: p, end: p, closed: true }));
    const nn = planOrder(seams, { maxPasses: 0 });
    const opt = planOrder(seams);
    expect(opt.airMm).toBeLessThanOrEqual(nn.airMm + 1e-9);
  });
});

describe("torch frame", () => {
  test("points into a 90° corner along the bisector, tilted by travel angle", () => {
    const f = torchFrame([0, 1, 0], [0, 0, 1], [1, 0, 0], 0, 0);
    expect(f.axis.map((v) => Math.round(v * 1000) / 1000)).toEqual([-0.707, 0, -0.707]);
    const pushed = torchFrame([0, 1, 0], [0, 0, 1], [1, 0, 0], 0, 15);
    expect(pushed.axis[1]).toBeGreaterThan(0.2); 
  });
});

describe("weld job", () => {
  const procedure = EXAMPLE_PROCEDURES[0]!;
/**
 * build a standard two-seam job input for tests
 */
  const input = (): JobInput => ({
    meta: { name: "Test", notes: "", status: "draft", createdAt: "2026-11-04T10:00:00.000Z", id: "job_test" },
    part: { filename: "t.stl", sha256: "a".repeat(64), triangles: 12, min: [0, 0, 0], max: [100, 200, 60], repaired: false },
    units: "mm", upAxis: "+z", procedures: EXAMPLE_PROCEDURES,
    seams: [
      { ...line([45, 0, 10], [45, 200, 10]), id: "s1", name: "S1", jointType: "fillet", angleDeg: 90, weld: defaultWeld(procedure), waitAfterS: 5 },
      { ...line([55, 200, 10], [55, 0, 10]), id: "s2", name: "S2", jointType: "fillet", angleDeg: 90, weld: defaultWeld(procedure), waitAfterS: 0 },
    ],
    airSpeedMmS: 100, waypointSpacingMm: 50, supervision: "operator_confirm",
  });

  test("compiles to a schema-valid job with totals and waypoints", async () => {
    const job = await sealWeldJob(compileWeldJob(input()));
    const parsed = weldJobSchema.safeParse(job);
    if (!parsed.success) console.log(JSON.stringify(parsed.error.issues.slice(0, 5), null, 1));
    expect(parsed.success).toBe(true);
    expect(job.seams.map((s) => s.sequence)).toEqual([1, 2]);
    expect(job.seams[0]!.geometry.waypoints.length).toBe(5);
    expect(job.totals.arc_time_s).toBeCloseTo(60, 1);
    expect(job.totals.air_travel_mm).toBeCloseTo(10 + 80, 1); 
    expect(job.totals.wait_time_s).toBe(5);
    expect(job.validation.errors).toEqual([]);
  });

  test("a seam without a procedure is an error; the hash is deterministic and verifiable", async () => {
    const bad = input();
    bad.seams[1] = { ...bad.seams[1]!, weld: undefined };
    expect(compileWeldJob(bad).validation.errors.map((e) => e.code)).toContain("seam.no_procedure");

    const a = await sealWeldJob(compileWeldJob(input()));
    const b = await sealWeldJob(compileWeldJob(input()));
    expect(a.integrity.content_sha256).toBe(b.integrity.content_sha256);
    expect(await verifyWeldJob(a)).toBe(true);
    expect(await verifyWeldJob({ ...a, job: { ...a.job, name: "changed" } })).toBe(false);
  });
});
