import { describe, expect, test } from "bun:test";
import { useStore } from "../src/state/store";
import type { SeamCandidate } from "@weld/core";

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

  test("deleting a detected seam stops it coming back", () => {
    useStore.getState().loadAnother();
    detect("a");
    useStore.getState().acceptSeams(["a"]);
    useStore.getState().deleteSeam("a");
    detect("a");
    expect(useStore.getState().seams).toEqual([]);
  });
});
