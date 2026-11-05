import { describe, expect, test } from "bun:test";
import { DEFAULT_DETECT_OPTIONS, analyseMesh, detectSeams, seamId } from "../src/index.ts";
import type { DetectOptions, SeamCandidate } from "../src/index.ts";
import { binaryStl, box, prism } from "./fixtures.ts";
import type { Tri } from "./fixtures.ts";

/**
 * analyse triangles and detect seams with merged options
 */
function detect(tris: Tri[], options: Partial<DetectOptions> = {}) {
  const m = analyseMesh(binaryStl(tris));
  return detectSeams(m.vertices, m.orientedIndices, m.bodyOfTriangle, { ...DEFAULT_DETECT_OPTIONS, ...options });
}

/**
 * map candidates to sorted rounded lengths for assertions
 */
const lengths = (cs: SeamCandidate[]) => cs.map((c) => Math.round(c.length)).sort((a, b) => a - b);

const T_OUTLINE: [number, number][] = [[0, 0], [100, 0], [100, 10], [55, 10], [55, 60], [45, 60], [45, 10], [0, 10]];

describe("detectSeams", () => {

  test("T-joint as one solid gives its two fillet seams", () => {
    const { candidates } = detect(prism(T_OUTLINE, 200));
    expect(candidates.map((c) => c.source)).toEqual(["inside_corner", "inside_corner"]);
    expect(lengths(candidates)).toEqual([200, 200]);
    expect(candidates.every((c) => c.jointType === "fillet" && c.angleDeg === 90 && c.confidence === 0.9)).toBe(true);
  });

  test("T-joint as two plates is found by contact", () => {
    const { candidates } = detect([...box(0, 0, 0, 100, 200, 10), ...box(45, 0, 10, 55, 200, 60)]);
    const contact = candidates.filter((c) => c.source === "contact");
    expect(lengths(contact)).toEqual([10, 10, 200, 200]);
    expect(contact.every((c) => c.jointType === "fillet")).toBe(true);
    expect(candidates.filter((c) => c.source === "intersection")).toEqual([]);
  });

  test("a closed box has no inside corners, and twelve outside edges on request", () => {
    expect(detect(box(0, 0, 0, 50, 40, 30)).candidates).toEqual([]);
    expect(detect(box(0, 0, 0, 50, 40, 30), { includeOutside: true }).candidates.length).toBe(12);
  });

  test("a rounded inside corner is not mistaken for a weld", () => {
    const sharp: [number, number][] = [[0, 0], [100, 0], [100, 10], [10, 10], [10, 60], [0, 60]];
    const rounded: [number, number][] = [[0, 0], [100, 0], [100, 10], [15, 10], [11.464, 11.464], [10, 15], [10, 60], [0, 60]];
    expect(detect(prism(sharp, 150)).candidates.length).toBe(1);
    expect(detect(prism(rounded, 150)).candidates).toEqual([]);
  });

  test("a column through a plate is found by intersection", () => {
    const { candidates } = detect([...box(0, 0, 0, 100, 100, 10), ...box(40, 40, -20, 60, 60, 40)]);
    const crossing = candidates.filter((c) => c.source === "intersection");
    expect(crossing.reduce((s, c) => s + c.length, 0)).toBeCloseTo(160, 3);
  });

  test("minimum length drops short pieces", () => {
    const { candidates } = detect([...box(0, 0, 0, 100, 200, 10), ...box(45, 0, 10, 55, 200, 60)], { minLength: 50 });
    expect(lengths(candidates)).toEqual([200, 200]);
  });

  test("ids are stable across runs and settings, and survive reversal", () => {
    const tris = prism(T_OUTLINE, 200);
    const first = detect(tris).candidates.map((c) => c.id).sort();
    const second = detect(tris, { featureAngleDeg: 45 }).candidates.map((c) => c.id).sort();
    expect(second).toEqual(first);

    const c = detect(tris).candidates[0]!;
    const n = c.points.length / 3;
    const reversed = new Float32Array(c.points.length);
    for (let i = 0; i < n; i++) reversed.set(c.points.subarray((n - 1 - i) * 3, (n - i) * 3), i * 3);
    expect(seamId("inside_corner", { ...c, points: reversed })).toBe(c.id);
  });

  test("a section keeps only the visible side and trims seams at the cut", () => {
    const plates = [...box(0, 0, 0, 100, 200, 10), ...box(45, 0, 10, 55, 200, 60)];
    const { candidates } = detect(plates, { region: { keep: { normal: [0, -1, 0], constant: 100 } } });
    expect(lengths(candidates)).toEqual([10, 100, 100]);
    expect(candidates.every((c) => Array.from(c.points).every((v, i) => i % 3 !== 1 || v <= 100 + 1e-4))).toBe(true);
  });

  test("a closed loop crossing the cut becomes the open piece on the kept side", () => {
    const column = [...box(0, 0, 0, 100, 100, 10), ...box(40, 40, -20, 60, 60, 40)];
    const crossing = detect(column, { region: { keep: { normal: [-1, 0, 0], constant: 50 } } }).candidates.filter((c) => c.source === "intersection");
    expect(crossing.every((c) => !c.closed)).toBe(true);
    expect(crossing.reduce((s, c) => s + c.length, 0)).toBeCloseTo(80, 3);
  });

  test("hidden bodies are left out of detection", () => {
    const plates = [...box(0, 0, 0, 100, 200, 10), ...box(45, 0, 10, 55, 200, 60)];
    expect(detect(plates, { region: { hiddenBodies: [1] } }).candidates).toEqual([]);
    expect(detect(plates, { region: { hiddenBodies: [1] } }).featureChains.length).toBeGreaterThan(0);
  });

  test("feature chains include convex and concave edges for picking", () => {
    expect(detect(box(0, 0, 0, 50, 40, 30)).featureChains.length).toBe(12);
  });
});

describe("split helpers", async () => {
  const { locateAlong, splitAtDistances, measure } = await import("../src/index.ts");
  const line = measure({ points: new Float32Array([0, 0, 0, 10, 0, 0, 10, 10, 0]), normalsA: new Float32Array(9), normalsB: new Float32Array(9), closed: false, length: 0 });

  test("locates a distance along the path", () => {
    expect(locateAlong(line, 15).point).toEqual([10, 5, 0]);
  });

  test("splits into even pieces", () => {
    expect(splitAtDistances(line, [5, 10, 15]).map((p) => Math.round(p.length))).toEqual([5, 5, 5, 5]);
  });

  test("a loop opens at the first cut, then splits", () => {
    const loop = measure({ points: new Float32Array([0, 0, 0, 10, 0, 0, 10, 10, 0, 0, 10, 0]), normalsA: new Float32Array(12), normalsB: new Float32Array(12), closed: true, length: 0 });
    expect(splitAtDistances(loop, [10, 30]).map((p) => Math.round(p.length))).toEqual([20, 20]);
  });
});
