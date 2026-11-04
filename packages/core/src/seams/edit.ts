import type { SeamPath } from "./types.ts";

function slice(path: SeamPath, from: number, to: number): SeamPath {
  const pick = (a: Float32Array) => a.slice(from * 3, (to + 1) * 3);
  return measure({ points: pick(path.points), normalsA: pick(path.normalsA), normalsB: pick(path.normalsB), closed: false, length: 0 });
}

export function measure(path: SeamPath): SeamPath {
  const p = path.points;
  const n = p.length / 3;
  let length = 0;
  for (let i = 1; i < n; i++) length += Math.hypot(p[i * 3]! - p[i * 3 - 3]!, p[i * 3 + 1]! - p[i * 3 - 2]!, p[i * 3 + 2]! - p[i * 3 - 1]!);
  if (path.closed && n > 2) length += Math.hypot(p[0]! - p[n * 3 - 3]!, p[1]! - p[n * 3 - 2]!, p[2]! - p[n * 3 - 1]!);
  return { ...path, length };
}

export function reversePath(path: SeamPath): SeamPath {
  const flip = (a: Float32Array) => {
    const out = new Float32Array(a.length);
    const n = a.length / 3;
    for (let i = 0; i < n; i++) out.set(a.subarray((n - 1 - i) * 3, (n - i) * 3), i * 3);
    return out;
  };
  return { ...path, points: flip(path.points), normalsA: flip(path.normalsA), normalsB: flip(path.normalsB) };
}

// Splits at parameter t along segment `segment` (from point segment to segment + 1, wrapping on loops).
// A closed loop opens at that point instead of becoming two pieces.
export function splitPath(path: SeamPath, segment: number, t: number): SeamPath[] {

  const n = path.points.length / 3;
  const j = (segment + 1) % n;
  const lerp = (a: Float32Array, i: number) => a[segment * 3 + i]! + (a[j * 3 + i]! - a[segment * 3 + i]!) * t;
  const cut = [lerp(path.points, 0), lerp(path.points, 1), lerp(path.points, 2)];

  const insert = (a: Float32Array, value: number[]) => {
    const out = new Float32Array(a.length + 3);
    out.set(a.subarray(0, (segment + 1) * 3));
    out.set(value, (segment + 1) * 3);
    out.set(a.subarray((segment + 1) * 3), (segment + 2) * 3);
    return out;
  };

  const withCut: SeamPath = {
    ...path,
    points: insert(path.points, cut),
    normalsA: insert(path.normalsA, Array.from(path.normalsA.subarray(segment * 3, segment * 3 + 3))),
    normalsB: insert(path.normalsB, Array.from(path.normalsB.subarray(segment * 3, segment * 3 + 3))),
  };
  const at = segment + 1;
  const total = n + 1;

  if (path.closed) {
    const rotate = (a: Float32Array) => {
      const out = new Float32Array(a.length + 3);
      out.set(a.subarray(at * 3));
      out.set(a.subarray(0, (at + 1) * 3), (total - at) * 3);
      return out;
    };
    return [measure({ points: rotate(withCut.points), normalsA: rotate(withCut.normalsA), normalsB: rotate(withCut.normalsB), closed: false, length: 0 })];
  }

  return [slice(withCut, 0, at), slice(withCut, at, total - 1)];
}

// Joins two open seams that share an end point (within tolerance), reversing either as needed.
export function joinPaths(a: SeamPath, b: SeamPath, tolerance: number): SeamPath | null {

  if (a.closed || b.closed) return null;

  const end = (p: SeamPath, last: boolean) => {
    const i = last ? p.points.length - 3 : 0;
    return [p.points[i]!, p.points[i + 1]!, p.points[i + 2]!];
  };
  const near = (p: number[], q: number[]) => Math.hypot(p[0]! - q[0]!, p[1]! - q[1]!, p[2]! - q[2]!) <= tolerance;

  let first = a;
  let second = b;

  if (near(end(a, true), end(b, false))) {
    // already in order
  } else if (near(end(a, true), end(b, true))) {
    second = reversePath(b);
  } else if (near(end(a, false), end(b, false))) {
    first = reversePath(a);
  } else if (near(end(a, false), end(b, true))) {
    first = b;
    second = a;
  } else {
    return null;
  }

  const join = (x: Float32Array, y: Float32Array) => {
    const out = new Float32Array(x.length + y.length - 3);
    out.set(x);
    out.set(y.subarray(3), x.length);
    return out;
  };

  const joined = measure({ points: join(first.points, second.points), normalsA: join(first.normalsA, second.normalsA), normalsB: join(first.normalsB, second.normalsB), closed: false, length: 0 });
  return near(end(joined, false), end(joined, true)) ? measure({ ...joined, points: joined.points.slice(0, -3), normalsA: joined.normalsA.slice(0, -3), normalsB: joined.normalsB.slice(0, -3), closed: true }) : joined;
}
