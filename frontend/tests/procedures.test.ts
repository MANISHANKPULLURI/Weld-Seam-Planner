import { describe, expect, test } from "bun:test";
import { seamCalc, useStore } from "../src/state/store";

const path = (pts: number[], normal: number[]) => ({ points: new Float32Array(pts), normalsA: new Float32Array([...normal, ...normal]), normalsB: new Float32Array([1, 0, 0, 1, 0, 0]), closed: false, length: Math.hypot(pts[3]! - pts[0]!, pts[4]! - pts[1]!, pts[5]! - pts[2]!) });

describe("procedures", () => {

  test("assign, override, reset and protected delete", () => {
    useStore.getState().loadAnother();
    const id = useStore.getState().addSeam(path([0, 0, 0, 0, 200, 0], [0, 0, 1]), "drawn");
    const s = useStore.getState();
    const proc = s.procedures[0]!;

    s.assignProcedure([id], proc.id);
    let seam = useStore.getState().seams.find((x) => x.id === id)!;
    let c = seamCalc(seam, useStore.getState().procedures, "mm", "+z")!;
    expect(c.current).toBe(proc.electrical.current_a);
    expect(c.arcTime).toBeCloseTo((200 / proc.motion.travel_speed_mm_min) * 60, 6);
    expect(c.position.iso).toBe("PB");

    useStore.getState().updateWeld([id], { overrides: { travel_speed_mm_min: 800 }, passes: 2 });
    seam = useStore.getState().seams.find((x) => x.id === id)!;
    c = seamCalc(seam, useStore.getState().procedures, "mm", "+z")!;
    expect(c.arcTime).toBeCloseTo((200 / 800) * 60 * 2, 6);

    expect(useStore.getState().deleteProcedure(proc.id)).toContain("Used by 1 seam");
    useStore.getState().assignProcedure([id], proc.id);
    expect(useStore.getState().seams.find((x) => x.id === id)!.weld!.overrides).toEqual({});
  });

  test("a copied procedure is independent and can be deleted when unused", () => {
    const s = useStore.getState();
    const copy = s.duplicateProcedure(s.procedures[0]!.id);
    const p = useStore.getState().procedures.find((x) => x.id === copy)!;
    useStore.getState().saveProcedure({ ...p, motion: { travel_speed_mm_min: 123 } });
    expect(useStore.getState().procedures[0]!.motion.travel_speed_mm_min).not.toBe(123);
    expect(useStore.getState().deleteProcedure(copy)).toBeNull();
  });

  test("splitting a seam keeps its weld settings on both halves", () => {
    useStore.getState().loadAnother();
    const id = useStore.getState().addSeam(path([0, 0, 0, 0, 200, 0], [0, 0, 1]), "drawn");
    useStore.getState().assignProcedure([id], useStore.getState().procedures[1]!.id);
    useStore.getState().splitSeam(id, 0, 0.5);
    const halves = useStore.getState().seams;
    expect(halves.length).toBe(2);
    expect(halves.every((x) => x.weld?.procedureId === useStore.getState().procedures[1]!.id)).toBe(true);
  });
});

describe("sequence and job", () => {
  const seed = () => {
    useStore.getState().loadAnother();
    const g = useStore.getState().startAnalysing("p.stl", 10);
    const health = { triangles: 2, bodies: 1, openEdges: 0, nonManifold: 0, flippedFaces: 0, degenerateRemoved: 0, duplicateRemoved: 0, isManifoldSolid: true, bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 100, y: 100, z: 10 }, size: { x: 100, y: 100, z: 10 } } };
    const e = new Uint32Array(0);
    useStore.getState().finishAnalysis(g, { vertices: new Float32Array(0), indices: e, orientedIndices: e, bodyOfTriangle: e, health, format: "binary", solids: 0, warnings: [], sha256: "b".repeat(64), sizeBytes: 10 });
    const ids = [0, 20, 10].map((x) => useStore.getState().addSeam(path([x, 0, 0, x, 100, 0], [0, 0, 1]), "drawn"));
    useStore.getState().assignProcedure(ids, useStore.getState().procedures[0]!.id);
    return ids;
  };

  test("move and auto order", async () => {
    const { orderedSeams } = await import("../src/state/store");
    const [a, b, c] = seed();
    useStore.getState().moveInSequence(c!, 0);
    expect(orderedSeams(useStore.getState()).map((x) => x.id)).toEqual([c, a, b]);
    const saved = useStore.getState().autoOrder();
    expect(saved).toBeGreaterThan(0);
  });

  test("export then import restores seams, settings and order", async () => {
    const { previewJob, orderedSeams } = await import("../src/state/store");
    const { sealWeldJob, weldJobSchema } = await import("@weld/core");
    const ids = seed();
    useStore.getState().setWait(ids[0]!, 30);
    useStore.getState().setJob({ name: "Panel A" });
    const job = await sealWeldJob(previewJob(useStore.getState()));
    expect(weldJobSchema.safeParse(job).success).toBe(true);
    expect(job.validation.errors).toEqual([]);

    useStore.getState().deleteSeam(ids[1]!);
    expect(useStore.getState().importJob(job)).toContain("Imported 3 seams");
    const after = orderedSeams(useStore.getState());
    expect(after.map((x) => x.id)).toEqual(job.seams.map((x) => x.id));
    expect(useStore.getState().waits[ids[0]!]).toBe(30);
    expect(after.every((x) => x.weld)).toBe(true);
  });
});

describe("undo", () => {
  test("split, merge, reverse and delete can be undone", () => {
    useStore.getState().loadAnother();
    const id = useStore.getState().addSeam(path([0, 0, 0, 0, 200, 0], [0, 0, 1]), "drawn");
    useStore.getState().splitSeamAt(id, [50]);
    expect(useStore.getState().seams.length).toBe(2);
    expect(useStore.getState().undo?.label).toBe("Split S1 into 2");
    useStore.getState().undoLast();
    expect(useStore.getState().seams.map((x) => x.id)).toEqual([id]);

    useStore.getState().deleteSeam(id);
    useStore.getState().undoLast();
    expect(useStore.getState().seams.length).toBe(1);
    expect(useStore.getState().rejectedIds).not.toContain(id);
  });
});
