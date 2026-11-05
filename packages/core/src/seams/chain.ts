import type { SeamPath } from "./types.ts";

export type Segment = {
  a: [number, number, number];
  b: [number, number, number];
  normalA: [number, number, number];
  normalB: [number, number, number];
};

const CORNER_DEG = 35;




/**
 * chain segments into continuous seam paths by spatial tolerance
 */
export function chainSegments(segments: Segment[], tolerance: number): SeamPath[] {

  const keyOf = (p: [number, number, number]) => `${Math.round(p[0] / tolerance)},${Math.round(p[1] / tolerance)},${Math.round(p[2] / tolerance)}`;

  const nodeIds = new Map<string, number>();
  const nodePoints: [number, number, number][] = [];
  const incident: number[][] = [];
  const ends: [number, number][] = [];

  const node = (p: [number, number, number]) => {
    const key = keyOf(p);
    let id = nodeIds.get(key);
    if (id === undefined) {
      id = nodePoints.length;
      nodeIds.set(key, id);
      nodePoints.push(p);
      incident.push([]);
    }
    return id;
  };

  for (let s = 0; s < segments.length; s++) {
    const a = node(segments[s]!.a), b = node(segments[s]!.b);
    ends.push([a, b]);
    if (a === b) continue;
    incident[a]!.push(s);
    incident[b]!.push(s);
  }

  const other = (s: number, n: number) => (ends[s]![0] === n ? ends[s]![1] : ends[s]![0]);
  const cosCorner = Math.cos((CORNER_DEG * Math.PI) / 180);

  const isBreak = (n: number) => {
    const list = incident[n]!;
    if (list.length !== 2) return true;
    const p = nodePoints[n]!, p1 = nodePoints[other(list[0]!, n)]!, p2 = nodePoints[other(list[1]!, n)]!;
    return dot(normalize(sub(p, p1)), normalize(sub(p2, p))) < cosCorner;
  };

  const used = new Uint8Array(segments.length);
  const paths: SeamPath[] = [];

  const walk = (startNode: number, firstSegment: number) => {
    const nodes = [startNode];
    const segs: number[] = [];
    let n = startNode;
    let s = firstSegment;
    while (true) {
      used[s] = 1;
      segs.push(s);
      n = other(s, n);
      nodes.push(n);
      if (n === startNode || isBreak(n)) break;
      const next = incident[n]!.find((x) => !used[x]);
      if (next === undefined) break;
      s = next;
    }
    paths.push(toPath(nodes, segs, nodePoints, segments, nodes[0] === nodes[nodes.length - 1]));
  };

  for (let n = 0; n < nodePoints.length; n++) {
    if (!isBreak(n)) continue;
    for (const s of incident[n]!) if (!used[s]) walk(n, s);
  }

  for (let s = 0; s < segments.length; s++) {
    if (!used[s] && ends[s]![0] !== ends[s]![1]) walk(ends[s]![0], s);
  }

  return paths;
}


/**
 * build a seam path with points, normals and length from chained nodes
 */
function toPath(nodes: number[], segs: number[], nodePoints: [number, number, number][], segments: Segment[], closed: boolean): SeamPath {

  const count = closed ? nodes.length - 1 : nodes.length;
  const points = new Float32Array(count * 3);
  const normalsA = new Float32Array(count * 3);
  const normalsB = new Float32Array(count * 3);

  let length = 0;

  for (let i = 0; i < count; i++) {
    const p = nodePoints[nodes[i]!]!;
    const seg = segments[segs[Math.min(i, segs.length - 1)]!]!;
    points.set(p, i * 3);
    normalsA.set(seg.normalA, i * 3);
    normalsB.set(seg.normalB, i * 3);
    if (i > 0) length += len(sub(p, nodePoints[nodes[i - 1]!]!));
  }

  if (closed) length += len(sub(nodePoints[nodes[0]!]!, nodePoints[nodes[count - 1]!]!));

  return { points, normalsA, normalsB, closed, length };
}

/**
 * subtract two 3d vectors element-wise
 */
export function sub(a: number[], b: number[]): [number, number, number] {
  return [a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!];
}

/**
 * compute dot product of two vectors
 */
export function dot(a: number[], b: number[]): number {
  return a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
}

/**
 * compute euclidean length of a vector
 */
export function len(a: number[]): number {
  return Math.hypot(a[0]!, a[1]!, a[2]!);
}

/**
 * normalize a vector to unit length safely
 */
export function normalize(a: number[]): [number, number, number] {
  const l = len(a) || 1;
  return [a[0]! / l, a[1]! / l, a[2]! / l];
}
