import { describe, expect, test } from "bun:test";
import { analyseMesh, buildTopology, labelBodies, orientFaces, repairMesh, weldVertices } from "../src/index.ts";
import { OUTWARD_CUBE, binaryStl, box, indexed, reversed, signedVolume } from "./fixtures.ts";
import type { Tri } from "./fixtures.ts";

const soup = (tris: Tri[]) => new Float32Array(tris.flat(2));

describe("weldVertices", () => {

  test("merges shared corners of a cube", () => {
    const welded = weldVertices(soup(OUTWARD_CUBE));
    expect(welded.vertices.length / 3).toBe(8);
    expect(welded.indices.length / 3).toBe(12);
  });

  test("merges points within tolerance across cell boundaries", () => {
    const tris: Tri[] = [[[0, 0, 0], [1, 0, 0], [0, 1, 0]], [[1e-7, 0, 0], [0, -1, 0], [1, 0, 0]]];
    const welded = weldVertices(soup(tris), 1e-6);
    expect(welded.vertices.length / 3).toBe(4);
  });

  test("removes degenerate and duplicate triangles", () => {
    const tris: Tri[] = [...OUTWARD_CUBE, OUTWARD_CUBE[0]!, reversed(OUTWARD_CUBE[1]!), [[0, 0, 0], [5, 0, 0], [10, 0, 0]], [[1, 1, 1], [1, 1, 1], [2, 2, 2]]];
    const welded = weldVertices(soup(tris));
    expect(welded.indices.length / 3).toBe(12);
    expect(welded.duplicateRemoved).toBe(2);
    expect(welded.degenerateRemoved).toBe(2);
  });
});

describe("topology and bodies", () => {

  test("closed cube has no open or non-manifold edges", () => {
    const { vertices, indices } = indexed(OUTWARD_CUBE);
    const topo = buildTopology(indices, vertices.length / 3);
    expect(topo.edgeCount).toBe(18);
    expect(topo.openEdges).toBe(0);
    expect(topo.nonManifold).toBe(0);
  });

  test("two separate boxes are two bodies", () => {
    const { vertices, indices } = indexed([...box(0, 0, 0, 10, 10, 10), ...box(20, 0, 0, 30, 10, 10)]);
    expect(labelBodies(indices, vertices.length / 3, buildTopology(indices, vertices.length / 3)).bodyCount).toBe(2);
  });

  test("boxes sharing an edge stay separate bodies", () => {
    const { vertices, indices } = indexed([...box(0, 0, 0, 10, 10, 10), ...box(10, 10, 0, 20, 20, 10)]);
    const topo = buildTopology(indices, vertices.length / 3);
    expect(topo.nonManifold).toBeGreaterThan(0);
    expect(labelBodies(indices, vertices.length / 3, topo).bodyCount).toBe(2);
  });
});

describe("orientFaces", () => {

  const orient = (tris: Tri[], rayVote = true) => {
    const { vertices, indices } = indexed(tris);
    const result = orientFaces(vertices, indices, buildTopology(indices, vertices.length / 3), { rayVote });
    return { vertices, indices, result };
  };

  test("leaves an outward cube unchanged", () => {
    const { indices, result } = orient(OUTWARD_CUBE);
    expect(result.flipped).toBe(0);
    expect(Array.from(result.indices)).toEqual(Array.from(indices));
  });

  test("fixes a single reversed face", () => {
    const { vertices, result } = orient(OUTWARD_CUBE.map((t, i) => (i === 4 ? reversed(t) : t)));
    expect(result.flipped).toBe(1);
    expect(signedVolume(vertices, new Int32Array(result.indices))).toBeCloseTo(1000, 3);
  });

  test("turns an inside-out cube outward", () => {
    const { vertices, result } = orient(OUTWARD_CUBE.map(reversed));
    expect(result.flipped).toBe(12);
    expect(signedVolume(vertices, new Int32Array(result.indices))).toBeCloseTo(1000, 3);
  });

  test("does not mutate its input", () => {
    const { indices, result } = orient(OUTWARD_CUBE.map(reversed));
    expect(result.indices).not.toBe(indices);
    expect(indices[1]).not.toBe(result.indices[1]);
  });

  test("ray voting turns an inside-out open box outward", () => {
    const openBox = OUTWARD_CUBE.filter((_, i) => i !== 4 && i !== 5).map(reversed);
    expect(orient(openBox, true).result.flipped).toBe(10);
  });

  test("without ray voting an open box falls back to the majority rule", () => {
    const openBox = OUTWARD_CUBE.filter((_, i) => i !== 4 && i !== 5).map(reversed);
    expect(orient(openBox, false).result.flipped).toBe(0);
  });
});

describe("analyseMesh and repairMesh", () => {

  test("reports health with progress for every stage", () => {
    const stages = new Set<string>();
    const result = analyseMesh(binaryStl(OUTWARD_CUBE.map(reversed)), { onProgress: (s) => stages.add(s) });
    expect([...stages]).toEqual(["read", "weld", "topology", "orient"]);
    expect(result.health.flippedFaces).toBe(12);
    expect(result.health.bodies).toBe(1);
    expect(result.health.isManifoldSolid).toBe(true);
  });

  test("repair closes a hole and orients outward", () => {
    const analysed = analyseMesh(binaryStl(OUTWARD_CUBE.slice(0, 10)));
    expect(analysed.health.openEdges).toBe(4);
    const repaired = repairMesh(analysed.vertices, analysed.indices);
    expect(repaired.stats.closed).toBe(2);
    expect(repaired.health.openEdges).toBe(0);
    expect(repaired.health.flippedFaces).toBe(0);
    expect(signedVolume(analysed.vertices, new Int32Array(repaired.indices))).toBeCloseTo(1000, 3);
  });

  test("handles a 200k-triangle part quickly", () => {
    const tris: Tri[] = [];
    const n = 316;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      tris.push([[i, j, 0], [i + 1, j + 1, 0], [i + 1, j, 0]], [[i, j, 0], [i, j + 1, 0], [i + 1, j + 1, 0]]);
    }
    const start = performance.now();
    const result = analyseMesh(binaryStl(tris));
    const elapsed = performance.now() - start;
    expect(result.health.triangles).toBe(n * n * 2);
    expect(result.health.bodies).toBe(1);
    expect(elapsed).toBeLessThan(5000);
  });
});
