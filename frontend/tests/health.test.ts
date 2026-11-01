import { describe, expect, test } from "bun:test";
import { checkHealth } from "../src/domain/mesh/health.ts";
import type { Mesh } from "../src/domain/mesh/primitives.ts";

function tri(a: number[], b: number[], c: number[]): Mesh {
  return { triangles: [{ a: { x: a[0], y: a[1], z: a[2] }, b: { x: b[0], y: b[1], z: b[2] }, c: { x: c[0], y: c[1], z: c[2] } }] };
}
function meshFromTris(tris: number[][][]): Mesh {
  return { triangles: tris.map(([a,b,c]) => ({ a: {x:a[0],y:a[1],z:a[2]}, b:{x:b[0],y:b[1],z:b[2]}, c:{x:c[0],y:c[1],z:c[2]} })) };
}

describe("checkHealth", () => {
  test("single triangle has 3 open edges", () => {
    const h = checkHealth(tri([0,0,0],[1,0,0],[0,1,0]));
    expect(h.triangles).toBe(1);
    expect(h.openEdges).toBe(3);
  });

  test("closed tetrahedron has 0 open edges", () => {
    const m = meshFromTris([
      [[0,0,0],[1,0,0],[0,1,0]],
      [[0,0,0],[0,1,0],[0,0,1]],
      [[0,0,0],[0,0,1],[1,0,0]],
      [[1,0,0],[0,0,1],[0,1,0]],
    ]);
    const h = checkHealth(m);
    expect(h.openEdges).toBe(0);
    expect(h.bodies).toBe(1);
  });

  test("two separate triangles are 2 bodies", () => {
    const m = meshFromTris([
      [[0,0,0],[1,0,0],[0,1,0]],
      [[10,10,10],[11,10,10],[10,11,10]],
    ]);
    expect(checkHealth(m).bodies).toBe(2);
    expect(checkHealth(m).openEdges).toBe(6);
  });

  test("empty mesh returns 0", () => {
    const h = checkHealth({ triangles: [] });
    expect(h.triangles).toBe(0);
    expect(h.bodies).toBe(0);
    expect(h.openEdges).toBe(0);
  });

  test("shared edge reduces open count", () => {
    const m = meshFromTris([
      [[0,0,0],[1,0,0],[0,1,0]],
      [[1,0,0],[1,1,0],[0,1,0]],
    ]);
    const h = checkHealth(m);
    expect(h.openEdges).toBe(4);
    expect(h.bodies).toBe(1);
  });

  test("bounds computed correctly", () => {
    const h = checkHealth(tri([0,0,0],[2,0,0],[0,5,0]));
    expect(h.bounds.min).toEqual({ x: 0, y: 0, z: 0 });
    expect(h.bounds.max).toEqual({ x: 2, y: 5, z: 0 });
    expect(h.bounds.size).toEqual({ x: 2, y: 5, z: 0 });
  });

  test("hasFlippedFaces is false baseline", () => {
    expect(checkHealth(tri([0,0,0],[1,0,0],[0,1,0])).hasFlippedFaces).toBe(false);
  });

  test("non-manifold not counted as open", () => {
    const base = meshFromTris([
      [[0,0,0],[1,0,0],[0,1,0]],
      [[0,0,0],[1,0,0],[0,0,1]],
      [[0,0,0],[1,0,0],[0,-1,0]],
    ]);
    const h = checkHealth(base);
    expect(h.openEdges).toBeLessThan(9);
  });
});
