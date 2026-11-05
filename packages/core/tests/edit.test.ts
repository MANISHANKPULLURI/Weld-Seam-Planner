import { describe, expect, test } from "bun:test";
import { joinPaths, measure, reversePath, splitPath } from "../src/index.ts";
import type { SeamPath } from "../src/index.ts";

/**
 * build a measured seam path from points for edit tests
 */
const path = (pts: number[][], closed = false): SeamPath => {
  const points = new Float32Array(pts.flat());
  const normals = new Float32Array(pts.length * 3);
  return measure({ points, normalsA: normals, normalsB: normals.slice(), closed, length: 0 });
};

describe("seam edits", () => {

  test("reverse keeps length and flips order", () => {
    const r = reversePath(path([[0, 0, 0], [10, 0, 0], [10, 5, 0]]));
    expect(Array.from(r.points.subarray(0, 3))).toEqual([10, 5, 0]);
    expect(r.length).toBe(15);
  });

  test("split a straight seam in the middle of its only segment", () => {
    const [a, b] = splitPath(path([[0, 0, 0], [100, 0, 0]]), 0, 0.25);
    expect(a!.length).toBeCloseTo(25);
    expect(b!.length).toBeCloseTo(75);
    expect(Array.from(b!.points.subarray(0, 3))).toEqual([25, 0, 0]);
  });

  test("split a closed loop opens it instead of making two pieces", () => {
    const square = path([[0, 0, 0], [10, 0, 0], [10, 10, 0], [0, 10, 0]], true);
    const parts = splitPath(square, 1, 0.5);
    expect(parts.length).toBe(1);
    expect(parts[0]!.closed).toBe(false);
    expect(parts[0]!.length).toBeCloseTo(40);
  });

  test("join reverses as needed and closes a loop when the ends meet", () => {
    const a = path([[0, 0, 0], [10, 0, 0]]);
    const b = path([[20, 0, 0], [10, 0, 0]]);
    expect(joinPaths(a, b, 0.01)!.length).toBeCloseTo(20);
    expect(joinPaths(a, path([[50, 0, 0], [60, 0, 0]]), 0.01)).toBeNull();
    const loop = joinPaths(path([[0, 0, 0], [10, 0, 0], [10, 10, 0]]), path([[10, 10, 0], [0, 10, 0], [0, 0, 0]]), 0.01)!;
    expect(loop.closed).toBe(true);
    expect(loop.length).toBeCloseTo(40);
  });
});
