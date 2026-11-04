import { describe, expect, test } from "bun:test";
import { orientConsistently } from "../src/controllers/mesh_detection_repair_controller/normals.ts";
import { runRepairPipeline, runValidationPipeline } from "../src/controllers/mesh_detection_repair_controller/pipeline.ts";
import { OUTWARD_CUBE, binaryStl, indexedMesh, reversed, signedVolume } from "./fixtures.ts";


describe("orientConsistently", () => {

  test("leaves an outward, consistent cube unchanged", () => {
    const { vertices, indices } = indexedMesh(OUTWARD_CUBE);
    const result = orientConsistently(vertices, indices);
    expect(result.flipped).toBe(0);
    expect(result.conflicts).toBe(0);
    expect(Array.from(result.indexArray)).toEqual(Array.from(indices));
  });

  test("fixes a single reversed face", () => {
    const tris = OUTWARD_CUBE.map((t, i) => (i === 4 ? reversed(t) : t));
    const { vertices, indices } = indexedMesh(tris);
    const result = orientConsistently(vertices, indices);
    expect(result.flipped).toBe(1);
    expect(signedVolume(vertices, result.indexArray)).toBeCloseTo(1000, 3);
  });

  test("turns an inside-out cube outward", () => {
    const { vertices, indices } = indexedMesh(OUTWARD_CUBE.map(reversed));
    expect(signedVolume(vertices, indices)).toBeCloseTo(-1000, 3);
    const result = orientConsistently(vertices, indices);
    expect(result.flipped).toBe(12);
    expect(signedVolume(vertices, result.indexArray)).toBeCloseTo(1000, 3);
  });

  test("does not mutate its input", () => {
    const { vertices, indices } = indexedMesh(OUTWARD_CUBE.map(reversed));
    const before = Array.from(indices);
    orientConsistently(vertices, indices);
    expect(Array.from(indices)).toEqual(before);
  });

  test("open mesh keeps the majority orientation", () => {
    const open = OUTWARD_CUBE.slice(0, 4).concat(OUTWARD_CUBE.slice(6));
    const tris = open.map((t, i) => (i === 0 ? reversed(t) : t));
    const { vertices, indices } = indexedMesh(tris);
    expect(orientConsistently(vertices, indices).flipped).toBe(1);
  });
});


describe("pipelines", () => {

  test("validation reports flipped faces", () => {
    const health = runValidationPipeline(binaryStl(OUTWARD_CUBE.map(reversed))).health;
    expect(health.flippedFaces).toBe(12);
    expect(health.isManifoldSolid).toBe(true);
  });

  test("repair orients an inside-out cube outward", () => {
    const result = runRepairPipeline(binaryStl(OUTWARD_CUBE.map(reversed)));
    expect(result.stats.aligned).toBe(12);
    expect(result.health.flippedFaces).toBe(0);
    expect(signedVolume(result.welded.uniqueVertices, result.welded.indexArray)).toBeCloseTo(1000, 3);
  });

  test("repair keeps a correct cube correct", () => {
    const result = runRepairPipeline(binaryStl(OUTWARD_CUBE));
    expect(result.stats.aligned).toBe(0);
    expect(signedVolume(result.welded.uniqueVertices, result.welded.indexArray)).toBeCloseTo(1000, 3);
  });

  test("repair closes a hole and orients the patch", () => {
    const result = runRepairPipeline(binaryStl(OUTWARD_CUBE.slice(0, 10)));
    expect(result.stats.closed).toBeGreaterThan(0);
    expect(result.health.openEdges).toBe(0);
    expect(signedVolume(result.welded.uniqueVertices, result.welded.indexArray)).toBeCloseTo(1000, 3);
  });
});
