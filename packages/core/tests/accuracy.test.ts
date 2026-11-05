import { describe, expect, test } from "bun:test";
import { DEFAULT_DETECT_OPTIONS, analyseMesh, detectSeams } from "../src/index.ts";
import type { SeamCandidate } from "../src/index.ts";
import { binaryStl, box, prism } from "./fixtures.ts";
import type { Tri } from "./fixtures.ts";




type P = [number, number, number];
type Case = { name: string; tris: Tri[]; seams: P[][]; closed?: boolean[] };

/**
 * generate regular polygon points of radius r
 */
const ngon = (r: number, n: number): [number, number][] => Array.from({ length: n }, (_, i) => [r * Math.cos((2 * Math.PI * i) / n), r * Math.sin((2 * Math.PI * i) / n)]);
/**
 * lift polygon points into a closed loop at height y
 */
const loopAtY = (y: number, pts: [number, number][]): P[] => [...pts, pts[0]!].map(([x, z]) => [x, y, z]);

const CASES: Case[] = [
  {
    name: "T-joint, two plates",
    tris: [...box(0, 0, 0, 100, 200, 10), ...box(45, 0, 10, 55, 200, 60)],
    seams: [[[45, 0, 10], [45, 200, 10]], [[55, 0, 10], [55, 200, 10]]],
  },
  {
    name: "T-joint, one solid",
    tris: prism([[0, 0], [100, 0], [100, 10], [55, 10], [55, 60], [45, 60], [45, 10], [0, 10]], 200),
    seams: [[[45, 0, 10], [45, 200, 10]], [[55, 0, 10], [55, 200, 10]]],
  },
  {
    name: "Lap joint, plate on plate",
    tris: [...box(0, 0, 0, 100, 100, 10), ...box(20, 20, 10, 80, 80, 16)],
    seams: [[[20, 20, 10], [80, 20, 10], [80, 80, 10], [20, 80, 10], [20, 20, 10]]],
  },
  {
    name: "Corner joint, upright on plate edge",
    tris: [...box(0, 0, 0, 120, 150, 10), ...box(0, 0, 10, 10, 150, 90)],
    seams: [[[10, 0, 10], [10, 150, 10]]],
  },
  {
    name: "Angled T-joint, web at 60°",
    tris: [...box(0, 0, 0, 160, 120, 10), ...prism([[50, 10], [60, 10], [60 + 60 / Math.tan(Math.PI / 3), 70], [50 + 60 / Math.tan(Math.PI / 3), 70]], 120)],
    seams: [[[50, 0, 10], [50, 120, 10]], [[60, 0, 10], [60, 120, 10]]],
  },
  {
    name: "Tube through a plate",
    tris: [...box(-50, 40, -50, 50, 50, 50), ...prism(ngon(15, 24), 100)],
    seams: [loopAtY(40, ngon(15, 24)), loopAtY(50, ngon(15, 24))],
  },
  {
    name: "Plain block (no seams)",
    tris: box(0, 0, 0, 80, 60, 40),
    seams: [],
  },
  {
    name: "Rounded inside corner, one solid (no seams)",
    tris: prism([[0, 0], [100, 0], [100, 10], [15, 10], [12.5, 10.67], [10.67, 12.5], [10, 15], [10, 60], [0, 60]], 150),
    seams: [],
  },
];


const R = (() => {
  const [a, b, c] = [0.43, -0.71, 1.12];
  const [ca, sa, cb, sb, cc, sc] = [Math.cos(a), Math.sin(a), Math.cos(b), Math.sin(b), Math.cos(c), Math.sin(c)];
  return [
    [cb * cc, -cb * sc, sb],
    [sa * sb * cc + ca * sc, -sa * sb * sc + ca * cc, -sa * cb],
    [-ca * sb * cc + sa * sc, ca * sb * sc + sa * cc, ca * cb],
  ];
})();
/**
 * rotate a point by the fixed test rotation matrix
 */
const rot = (p: P): P => R.map((row) => row[0]! * p[0] + row[1]! * p[1] + row[2]! * p[2]) as P;

/**
 * compute distance from a point to a single segment
 */
function distToSegment(p: P, a: P, b: P) {
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], ap = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
  const t = Math.max(0, Math.min(1, (ap[0]! * ab[0]! + ap[1]! * ab[1]! + ap[2]! * ab[2]!) / (ab[0]! ** 2 + ab[1]! ** 2 + ab[2]! ** 2 || 1)));
  return Math.hypot(ap[0]! - ab[0]! * t, ap[1]! - ab[1]! * t, ap[2]! - ab[2]! * t);
}
/**
 * compute minimum distance from a point to a polyline
 */
const distToLine = (p: P, line: P[]) => Math.min(...line.slice(1).map((b, i) => distToSegment(p, line[i]!, b)));
/**
 * sum segment lengths of a polyline
 */
const lineLength = (line: P[]) => line.slice(1).reduce((s, b, i) => s + Math.hypot(b[0] - line[i]![0], b[1] - line[i]![1], b[2] - line[i]![2]), 0);
/**
 * extract ordered points from a detected candidate path
 */
const pointsOf = (c: SeamCandidate): P[] => {
  const pts: P[] = Array.from({ length: c.points.length / 3 }, (_, i) => [c.points[i * 3]!, c.points[i * 3 + 1]!, c.points[i * 3 + 2]!]);
  return c.closed ? [...pts, pts[0]!] : pts;
};

/**
 * score detection recall and error for one rotated case
 */
function score(c: Case) {
  const tris = c.tris.map((t) => t.map(rot) as Tri);
  const seams = c.seams.map((line) => line.map(rot));
  const m = analyseMesh(binaryStl(tris));
  const { candidates } = detectSeams(m.vertices, m.orientedIndices, m.bodyOfTriangle, DEFAULT_DETECT_OPTIONS);

  const TOL = 0.05;
  let found = 0, maxError = 0;
  const onSeam = new Set<SeamCandidate>();

  for (const line of seams) {
    
    const total = lineLength(line);
    const steps = 200;
    let hit = 0;
    for (let s = 0; s <= steps; s++) {
      let d = (total * s) / steps, i = 0;
      while (i < line.length - 2 && d > lineLength([line[i]!, line[i + 1]!])) { d -= lineLength([line[i]!, line[i + 1]!]); i++; }
      const a = line[i]!, b = line[i + 1]!, t = d / (lineLength([a, b]) || 1);
      const p: P = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
      if (candidates.some((cand) => distToLine(p, pointsOf(cand)) < TOL)) hit++;
    }
    found += (hit / (steps + 1)) * total;
  }

  for (const cand of candidates) {
    const pts = pointsOf(cand);
    const line = seams.find((l) => pts.every((p) => distToLine(p, l) < TOL));
    if (!line) continue;
    onSeam.add(cand);
    maxError = Math.max(maxError, ...pts.map((p) => distToLine(p, line)));
  }

  const required = seams.reduce((s, l) => s + lineLength(l), 0);
  const extras = candidates.filter((x) => !onSeam.has(x));
  return { recall: required ? found / required : 1, maxError, candidates: candidates.length, extras };
}

describe("detection accuracy on known weldments (rotated)", () => {

  const results = CASES.map((c) => ({ name: c.name, ...score(c) }));

  test.each(results.map((r) => [r.name, r] as const))("%s: every real seam is found", (_, r) => {
    expect(r.recall).toBeGreaterThan(0.99);
    expect(r.maxError).toBeLessThan(0.01);
  });

  test("suggestions that are not real seams are only weld-able plate ends", () => {
    const extras = results.flatMap((r) => r.extras.map((x) => ({ name: r.name, source: x.source, length: Math.round(x.length) })));
    if (process.env.ACCURACY_REPORT) {
      console.table(results.map((r) => ({ case: r.name, recall: `${(r.recall * 100).toFixed(1)}%`, maxErrorMm: r.maxError.toExponential(1), suggested: r.candidates, notOnRealSeam: r.extras.length })));
      console.table(extras);
    }
    expect(extras.every((x) => x.length <= 12)).toBe(true);
  });
});
