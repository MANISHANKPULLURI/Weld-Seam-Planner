import { describe, expect, test } from "bun:test";
import { DEFAULT_DETECT_OPTIONS, analyseMesh, detectSeams, seamId } from "../src/index.ts";
import type { DetectOptions, SeamCandidate } from "../src/index.ts";
import { binaryStl, box, prism } from "./fixtures.ts";
import type { Tri } from "./fixtures.ts";

function detect(tris: Tri[], options: Partial<DetectOptions> = {}) {
  const m = analyseMesh(binaryStl(tris));
  return detectSeams(m.vertices, m.orientedIndices, m.bodyOfTriangle, { ...DEFAULT_DETECT_OPTIONS, ...options });
}

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

  test("feature chains include convex and concave edges for picking", () => {
    expect(detect(box(0, 0, 0, 50, 40, 30)).featureChains.length).toBe(12);
  });
});
