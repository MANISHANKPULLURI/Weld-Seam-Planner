import { describe, expect, test } from "bun:test";
import { useStore } from "../src/state/store";
import type { SeamCandidate } from "@weld/core";

/**
 * build a test seam candidate at position x
 */
const candidate = (id: string, x: number): SeamCandidate => ({
  id,
  source: "inside_corner",
  jointType: "fillet",
  angleDeg: 90,
  confidence: 0.9,
  reason: "Inside corner, 90°",
  points: new Float32Array([x, 0, 0, x, 100, 0]),
  normalsA: new Float32Array(6),
  normalsB: new Float32Array(6),
  closed: false,
  length: 100,
});

/**
 * feed test candidates through detection
 */
function detect(...ids: string[]) {
  const s = useStore.getState();
  const run = s.startDetect();
  s.finishDetect(run, { candidates: ids.map((id, i) => candidate(id, i * 10)), featureChains: [] });
}

describe("seam store", () => {

  test("re-detection keeps accepted seams and never brings back rejected ones", () => {
    useStore.getState().loadAnother();
    detect("a", "b", "c");
    const s = useStore.getState();
    s.acceptSeams(["a"]);
    s.rejectSeams(["b"]);
    detect("a", "b", "c", "d");

    const after = useStore.getState().seams;
    expect(after.filter((x) => x.status === "accepted").map((x) => [x.id, x.name])).toEqual([["a", "S1"]]);
    expect(after.filter((x) => x.status === "candidate").map((x) => x.id).sort()).toEqual(["c", "d"]);
  });

  test("picking an edge a candidate already follows replaces the candidate, and picking it twice adds nothing", () => {
    useStore.getState().loadAnother();
    detect("a", "b");
    const { normalsA, normalsB, points, closed, length } = candidate("x", 0);
    const id = useStore.getState().addSeam({ points, normalsA, normalsB, closed, length }, "edge_chain");
    const reversed = new Float32Array([0, 100, 0, 0, 0, 0]);
    expect(useStore.getState().addSeam({ points: reversed, normalsA, normalsB, closed, length }, "edge_chain")).toBe(id);
    const seams = useStore.getState().seams;
    expect(seams.filter((x) => x.status === "accepted").length).toBe(1);
    expect(seams.filter((x) => x.status === "candidate").map((x) => x.id)).toEqual(["b"]);
  });

  test("merge is offered only for accepted seams that touch end to end", async () => {
    const { mergeTargets } = await import("../src/state/store");
    useStore.getState().loadAnother();
    const s = useStore.getState();
    const path = (pts: number[]) => ({ points: new Float32Array(pts), normalsA: new Float32Array(pts.length), normalsB: new Float32Array(pts.length), closed: false, length: 100 });
    const a = s.addSeam(path([0, 0, 0, 100, 0, 0]), "drawn");
    const b = useStore.getState().addSeam(path([100, 0, 0, 100, 100, 0]), "drawn");
    useStore.getState().addSeam(path([0, 50, 0, 100, 50, 0]), "drawn");
    expect(mergeTargets(useStore.getState().seams, a).map((x) => x.id)).toEqual([b]);
    expect(useStore.getState().mergeSeams(a, b)).toBeNull();
    expect(useStore.getState().seams.length).toBe(2);
  });

  test("a confirmed work area keeps seams on its side, and closing the section returns to the whole model", async () => {
    const { inWorkArea } = await import("../src/state/store");
    const area = { plane: { normal: [-1, 0, 0] as [number, number, number], constant: 15 }, label: "X below 15 mm" };
    expect(inWorkArea(candidate("in", 10), area)).toBe(true);
    expect(inWorkArea(candidate("out", 20), area)).toBe(false);
    expect(inWorkArea(candidate("out", 20), null)).toBe(true);

    useStore.getState().setSection({ axis: "x", offset: 0.5, flipped: false });
    useStore.getState().setWorkArea(area);
    useStore.getState().setSection(null);
    expect(useStore.getState().workArea).toBeNull();
  });

  test("a stale detection result is ignored", () => {
    useStore.getState().loadAnother();
    const s = useStore.getState();
    const first = s.startDetect();
    s.startDetect();
    s.finishDetect(first, { candidates: [candidate("x", 0)], featureChains: [] });
    expect(useStore.getState().seams).toEqual([]);
  });

  test("split and merge round-trip a seam", () => {
    useStore.getState().loadAnother();
    detect("a");
    const s = useStore.getState();
    s.acceptSeams(["a"]);
    s.splitSeam("a", 0, 0.5);
    const parts = useStore.getState().seams;
    expect(parts.map((p) => p.length)).toEqual([50, 50]);
    expect(useStore.getState().mergeSeams(parts[0]!.id, parts[1]!.id)).toBeNull();
    expect(useStore.getState().seams.map((p) => p.length)).toEqual([100]);
  });

  test("checkpoint restores saved work, start over returns to the freshly loaded part", () => {
    const s = useStore.getState();
    const gen = s.startAnalysing("part.stl", 100);
    const health = { triangles: 2, bodies: 1, openEdges: 0, nonManifold: 0, flippedFaces: 0, degenerateRemoved: 0, duplicateRemoved: 0, isManifoldSolid: true, bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 300, y: 200, z: 100 }, size: { x: 300, y: 200, z: 100 } } };
    const empty = new Uint32Array(0);
    s.finishAnalysis(gen, { vertices: new Float32Array(0), indices: empty, orientedIndices: empty, bodyOfTriangle: empty, health, format: "binary", solids: 0, warnings: [], sha256: null, sizeBytes: 100 });
    useStore.getState().confirmFrame();
    detect("a", "b");
    useStore.getState().acceptSeams(["a"]);
    useStore.getState().saveCheckpoint();

    useStore.getState().acceptSeams(["b"]);
    useStore.getState().restoreCheckpoint();
    expect(useStore.getState().seams.filter((x) => x.status === "accepted").map((x) => x.id)).toEqual(["a"]);

    useStore.getState().resetToInitial();
    const after = useStore.getState();
    expect(after.seams).toEqual([]);
    expect(after.frame.confirmed).toBe(false);
    expect(after.step).toBe("part");
    expect(after.checkpoint).not.toBeNull();
  });

  test("filters hide candidates by type and length but never hide accepted seams", async () => {
    const { candidateVisible } = await import("../src/state/store");
    const seam = { ...candidate("x", 0), status: "candidate" as const, name: "" };
    expect(candidateVisible(seam, { hidden: [], minLengthMm: 0 }, "mm")).toBe(true);
    expect(candidateVisible(seam, { hidden: ["inside_corner"], minLengthMm: 0 }, "mm")).toBe(false);
    expect(candidateVisible(seam, { hidden: [], minLengthMm: 150 }, "mm")).toBe(false);
    expect(candidateVisible({ ...seam, status: "accepted" }, { hidden: ["inside_corner"], minLengthMm: 150 }, "mm")).toBe(true);
  });

  test("deleting a detected seam stops it coming back", () => {
    useStore.getState().loadAnother();
    detect("a");
    useStore.getState().acceptSeams(["a"]);
    useStore.getState().deleteSeam("a");
    detect("a");
    expect(useStore.getState().seams).toEqual([]);
  });
});
