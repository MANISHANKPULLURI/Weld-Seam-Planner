import { Box3, BufferAttribute, BufferGeometry, Line3, Matrix4, Plane, Triangle, Vector3 } from "three";
import { MeshBVH } from "three-mesh-bvh";
import type { HitPointInfo } from "three-mesh-bvh";
import { buildTopology, halfEdgeEnd } from "../mesh/topology.ts";
import { diagonalOf } from "../mesh/bounds.ts";
import { chainSegments, dot, len, normalize, sub } from "./chain.ts";
import type { Segment } from "./chain.ts";
import type { DetectOptions, DetectRegion, DetectResult, JointType, SeamCandidate, SeamPath, SeamSource } from "./types.ts";




export const DEFAULT_DETECT_OPTIONS: DetectOptions = { featureAngleDeg: 45, minLength: 5, contactTolerance: 0.05, includeOutside: false };

const EDGE_CHAIN_MIN_DEG = 20;
const MAX_OPENING_BEND_DEG = 120;
const BAND_MAX_DEG = 60;

type Crease = { h: number; f: number; g: number; angle: number; concave: boolean };


/**
 * detect weld seam candidates and feature chains from mesh triangles
 */
export function detectSeams(vertices: Float32Array, indices: Uint32Array, bodyOfTriangle: Uint32Array, options: DetectOptions = DEFAULT_DETECT_OPTIONS): DetectResult {

  const faceCount = indices.length / 3;
  const topology = buildTopology(indices, vertices.length / 3);
  const normals = faceNormals(vertices, indices);
  const tolerance = Math.max(diagonalOf(vertices) * 1e-6, 1e-9);

  const minDeg = Math.min(options.featureAngleDeg, EDGE_CHAIN_MIN_DEG);
  const creases: Crease[] = [];
  const creaseOfHalfEdge = new Int32Array(faceCount * 3).fill(-1);

  for (let h = 0; h < faceCount * 3; h++) {

    const t = topology.twin[h]!;
    if (t < h) continue;

    const f = (h / 3) | 0, g = (t / 3) | 0;
    const angle = (Math.acos(Math.max(-1, Math.min(1, dotAt(normals, f, g)))) * 180) / Math.PI;
    if (angle < minDeg) continue;

    creaseOfHalfEdge[h] = creaseOfHalfEdge[t] = creases.length;
    creases.push({ h, f, g, angle, concave: isConcave(vertices, indices, normals, f, g) });
  }

  const hidden = new Uint8Array(bodyCount(bodyOfTriangle));
  for (const b of options.region?.hiddenBodies ?? []) if (b < hidden.length) hidden[b] = 1;
  const visible = (c: Crease) => !hidden[bodyOfTriangle[c.f]!];

  const banded = creases.map((c) => isBanded(c, creases, creaseOfHalfEdge, vertices, indices, topology.twin, normals));

  const inside: Segment[] = [];
  const outside: Segment[] = [];
  const features: Segment[] = [];

  creases.forEach((c, i) => {
    const segment = edgeSegment(vertices, indices, normals, c);
    if (c.angle >= EDGE_CHAIN_MIN_DEG) features.push(segment);
    if (c.angle < options.featureAngleDeg || banded[i] || !visible(c)) return;
    if (c.concave && c.angle <= MAX_OPENING_BEND_DEG) inside.push(segment);
    if (!c.concave && options.includeOutside) outside.push(segment);
  });

  const candidates: SeamCandidate[] = [
    ...toCandidates(chainSegments(inside, tolerance), "inside_corner", "fillet", options),
    ...toCandidates(chainSegments(outside, tolerance), "outside_corner", "corner", options),
  ];

  const bodies = splitBodies(vertices, indices, bodyOfTriangle);

  if (bodies.length > 1) {
    const sharpConvex = creases.filter((c, i) => !c.concave && c.angle >= options.featureAngleDeg && !banded[i] && visible(c));
    for (const group of contactSegments(vertices, indices, normals, bodyOfTriangle, bodies, sharpConvex, options.contactTolerance, hidden)) {
      candidates.push(...toCandidates(chainSegments(group.segments, tolerance), "contact", group.joint, options));
    }
    candidates.push(...toCandidates(chainSegments(intersectionSegments(bodies, normals, tolerance, hidden), tolerance), "intersection", "fillet", options));
  }

  const keep = options.region?.keep;
  const inRegion = keep ? clipCandidates(candidates, keep, options) : candidates;

  
  return { candidates: dedupe(inRegion, Math.max(options.contactTolerance, tolerance) * 2), featureChains: chainSegments(features, tolerance) };
}


/**
 * count distinct bodies referenced by per-triangle body labels
 */
function bodyCount(bodyOfTriangle: Uint32Array): number {
  let count = 0;
  for (const b of bodyOfTriangle) if (b + 1 > count) count = b + 1;
  return count;
}




/**
 * clip seam candidates to the kept half-space of a section region
 */
function clipCandidates(candidates: SeamCandidate[], keep: NonNullable<DetectRegion["keep"]>, options: DetectOptions): SeamCandidate[] {

  const out: SeamCandidate[] = [];
  const side = (p: Float32Array, i: number) => keep.normal[0] * p[i * 3]! + keep.normal[1] * p[i * 3 + 1]! + keep.normal[2] * p[i * 3 + 2]! + keep.constant;

  for (const c of candidates) {

    const n = c.points.length / 3;
    const d = Array.from({ length: n }, (_, i) => side(c.points, i));

    if (d.every((x) => x >= 0)) { out.push(c); continue; }
    if (d.every((x) => x < 0)) continue;

    
    const start = c.closed ? d.findIndex((x) => x < 0) : 0;
    const steps = c.closed ? n : n - 1;
    const pieces: number[][][] = [];
    let current: number[][] | null = null;

    const point = (i: number) => [0, 1, 2].map((k) => c.points[i * 3 + k]!);
    const normal = (arr: Float32Array, i: number) => [0, 1, 2].map((k) => arr[i * 3 + k]!);
    const entry = (i: number) => [...point(i), ...normal(c.normalsA, i), ...normal(c.normalsB, i)];

    if (!c.closed && d[0]! >= 0) current = [entry(0)];

    for (let s = 0; s < steps; s++) {
      const i = (start + s) % n, j = (i + 1) % n;
      const di = d[i]!, dj = d[j]!;
      if ((di >= 0) !== (dj >= 0)) {
        const t = di / (di - dj);
        const near = t < 0.5 ? i : j;
        const cut = [...point(i).map((v, k) => v + (point(j)[k]! - v) * t), ...normal(c.normalsA, near), ...normal(c.normalsB, near)];
        if (di >= 0) { current!.push(cut); pieces.push(current!); current = null; }
        else current = [cut];
      }
      if (dj >= 0) current?.push(entry(j));
    }
    if (current) pieces.push(current);

    for (const piece of pieces) {
      if (piece.length < 2) continue;
      const points = new Float32Array(piece.flatMap((e) => e.slice(0, 3)));
      let length = 0;
      for (let i = 1; i < piece.length; i++) length += Math.hypot(points[i * 3]! - points[i * 3 - 3]!, points[i * 3 + 1]! - points[i * 3 - 2]!, points[i * 3 + 2]! - points[i * 3 - 1]!);
      if (length < options.minLength) continue;
      const path: SeamPath = { points, normalsA: new Float32Array(piece.flatMap((e) => e.slice(3, 6))), normalsB: new Float32Array(piece.flatMap((e) => e.slice(6, 9))), closed: false, length };
      out.push({ ...c, ...path, id: seamId(c.source, path) });
    }
  }

  return out;
}


/**
 * compute per-face unit normals for all triangles
 */
function faceNormals(vertices: Float32Array, indices: Uint32Array): Float64Array {

  const out = new Float64Array(indices.length);

  for (let f = 0; f < indices.length / 3; f++) {
    const a = indices[f * 3]! * 3, b = indices[f * 3 + 1]! * 3, c = indices[f * 3 + 2]! * 3;
    const ux = vertices[b]! - vertices[a]!, uy = vertices[b + 1]! - vertices[a + 1]!, uz = vertices[b + 2]! - vertices[a + 2]!;
    const vx = vertices[c]! - vertices[a]!, vy = vertices[c + 1]! - vertices[a + 1]!, vz = vertices[c + 2]! - vertices[a + 2]!;
    const n = normalize([uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx]);
    out[f * 3] = n[0]; out[f * 3 + 1] = n[1]; out[f * 3 + 2] = n[2];
  }

  return out;
}

const normalOf = (normals: Float64Array, f: number): [number, number, number] => [normals[f * 3]!, normals[f * 3 + 1]!, normals[f * 3 + 2]!];

const dotAt = (normals: Float64Array, f: number, g: number) => normals[f * 3]! * normals[g * 3]! + normals[f * 3 + 1]! * normals[g * 3 + 1]! + normals[f * 3 + 2]! * normals[g * 3 + 2]!;

const vertexAt = (vertices: Float32Array, v: number): [number, number, number] => [vertices[v * 3]!, vertices[v * 3 + 1]!, vertices[v * 3 + 2]!];


/**
 * compute centroid of a triangle face
 */
function centroidOf(vertices: Float32Array, indices: Uint32Array, face: number): [number, number, number] {
  const a = vertexAt(vertices, indices[face * 3]!), b = vertexAt(vertices, indices[face * 3 + 1]!), c = vertexAt(vertices, indices[face * 3 + 2]!);
  return [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3];
}


/**
 * test whether the dihedral edge between two faces is concave
 */
function isConcave(vertices: Float32Array, indices: Uint32Array, normals: Float64Array, f: number, g: number): boolean {

  const cf = centroidOf(vertices, indices, f), cg = centroidOf(vertices, indices, g);
  return dot(normalOf(normals, f), sub(cg, cf)) > 0 && dot(normalOf(normals, g), sub(cf, cg)) > 0;
}




/**
 * detect whether a crease belongs to a parallel rounded band
 */
function isBanded(c: Crease, creases: Crease[], creaseOfHalfEdge: Int32Array, vertices: Float32Array, indices: Uint32Array, twin: Int32Array, normals: Float64Array): boolean {

  if (c.angle > BAND_MAX_DEG) return false;

  const direction = edgeDirection(vertices, indices, c.h);
  const faces = new Set([c.f, c.g]);

  for (const face of [c.f, c.g]) {
    for (let k = 0; k < 3; k++) {
      const t = twin[face * 3 + k]!;
      if (t >= 0 && dotAt(normals, face, (t / 3) | 0) > 0.9998) faces.add((t / 3) | 0);
    }
  }

  for (const face of faces) {
    for (let k = 0; k < 3; k++) {
      const h = face * 3 + k;
      const other = creaseOfHalfEdge[h]!;
      if (other < 0 || creases[other] === c) continue;
      const n = creases[other]!;
      if (n.concave === c.concave && n.angle <= BAND_MAX_DEG && Math.abs(dot(direction, edgeDirection(vertices, indices, h))) > 0.9) return true;
    }
  }

  return false;
}

/**
 * compute unit direction vector of a half-edge
 */
function edgeDirection(vertices: Float32Array, indices: Uint32Array, h: number) {
  return normalize(sub(vertexAt(vertices, halfEdgeEnd(indices, h)), vertexAt(vertices, indices[h]!)));
}

/**
 * build a seam segment from a crease edge and its face normals
 */
function edgeSegment(vertices: Float32Array, indices: Uint32Array, normals: Float64Array, c: Crease): Segment {
  return { a: vertexAt(vertices, indices[c.h]!), b: vertexAt(vertices, halfEdgeEnd(indices, c.h)), normalA: normalOf(normals, c.f), normalB: normalOf(normals, c.g) };
}


type Body = { faces: Uint32Array; bvh: MeshBVH; box: Box3 };

/**
 * split mesh triangles by body label into bvh-backed volumes
 */
function splitBodies(vertices: Float32Array, indices: Uint32Array, bodyOfTriangle: Uint32Array): Body[] {

  let count = 0;
  for (const b of bodyOfTriangle) if (b + 1 > count) count = b + 1;
  if (count < 2) return [];

  const lists: number[][] = Array.from({ length: count }, () => []);
  bodyOfTriangle.forEach((b, f) => lists[b]!.push(f));

  return lists.map((list) => {
    const faces = Uint32Array.from(list);
    const index = new Uint32Array(faces.length * 3);
    faces.forEach((f, i) => index.set(indices.subarray(f * 3, f * 3 + 3), i * 3));
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(vertices, 3));
    geometry.setIndex(new BufferAttribute(index, 1));
    const bvh = new MeshBVH(geometry, { indirect: true });
    const box = new Box3();
    bvh.getBoundingBox(box);
    return { faces, bvh, box };
  });
}



/**
 * find contact segments where one body edge rests on another body
 */
function contactSegments(vertices: Float32Array, indices: Uint32Array, normals: Float64Array, bodyOfTriangle: Uint32Array, bodies: Body[], creases: Crease[], tolerance: number, hidden: Uint8Array): { joint: JointType; segments: Segment[] }[] {

  const groups: Record<"fillet" | "butt" | "corner", Segment[]> = { fillet: [], butt: [], corner: [] };
  const point = new Vector3();
  const hit: HitPointInfo = { point: new Vector3(), distance: 0, faceIndex: 0 };
  const edgeBox = new Box3();

  for (const c of creases) {

    const a = vertexAt(vertices, indices[c.h]!), b = vertexAt(vertices, halfEdgeEnd(indices, c.h));
    const length = len(sub(b, a));
    const samples = Math.max(2, Math.min(8, Math.ceil(length / (tolerance * 200))));
    const own = bodyOfTriangle[c.f]!;

    edgeBox.makeEmpty().expandByPoint(point.set(...a)).expandByPoint(point.set(...b)).expandByScalar(tolerance);

    for (let other = 0; other < bodies.length; other++) {

      if (other === own || hidden[other] || !bodies[other]!.box.intersectsBox(edgeBox)) continue;

      const body = bodies[other]!;
      let touching = true;

      for (let s = 0; s <= samples && touching; s++) {
        const t = s / samples;
        point.set(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t);
        touching = within(body, point, hit, tolerance);
      }

      if (!touching) continue;

      
      
      const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
      const probe = (face: number) => {
        const toward = sub(centroidOf(vertices, indices, face), mid);
        const step = Math.min(len(toward) * 0.5, Math.max(tolerance * 20, length * 0.01));
        const dir = normalize(toward);
        point.set(mid[0]! + dir[0] * step, mid[1]! + dir[1] * step, mid[2]! + dir[2] * step);
        return within(body, point, hit, tolerance) ? body.faces[body.bvh.resolveTriangleIndex(hit.faceIndex)]! : -1;
      };

      const onF = probe(c.f), onG = probe(c.g);
      const resting = onF >= 0 ? onF : onG;
      if (resting < 0) continue;

      const surface = normalOf(normals, resting);
      const free = normalOf(normals, onF >= 0 ? c.g : c.f);
      const d = dot(free, surface);
      const joint = d > 0.5 ? "butt" : d < -0.5 ? "corner" : "fillet";

      groups[joint].push({ a, b, normalA: free, normalB: surface });
      break;
    }
  }

  return (Object.keys(groups) as (keyof typeof groups)[]).map((joint) => ({ joint, segments: groups[joint] }));
}




/**
 * test whether a point lies within tolerance of a body surface
 */
function within(body: Body, point: Vector3, hit: HitPointInfo, tolerance: number): boolean {
  return body.bvh.closestPointToPoint(point, hit, 0, tolerance) !== null && hit.distance <= tolerance;
}




/**
 * find intersection segments where two body volumes cross
 */
function intersectionSegments(bodies: Body[], normals: Float64Array, tolerance: number, hidden: Uint8Array): Segment[] {

  const segments: Segment[] = [];
  const line = new Line3();
  const identity = new Matrix4();

  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {

      const A = bodies[i]!, B = bodies[j]!;
      if (hidden[i] || hidden[j] || !A.box.intersectsBox(B.box)) continue;

      A.bvh.bvhcast(B.bvh, identity, {
        intersectsTriangles: (t1, t2, i1, i2) => {
          const fa = A.faces[A.bvh.resolveTriangleIndex(i1)]!, fb = B.faces[B.bvh.resolveTriangleIndex(i2)]!;
          if (Math.abs(dotAt(normals, fa, fb)) > 0.98) return false;
          if (!straddles(t1, t2, tolerance) || !straddles(t2, t1, tolerance)) return false;
          if (t1.intersectsTriangle(t2, line) && line.distance() > tolerance) {
            segments.push({ a: line.start.toArray() as [number, number, number], b: line.end.toArray() as [number, number, number], normalA: normalOf(normals, fa), normalB: normalOf(normals, fb) });
          }
          return false;
        },
      });
    }
  }

  return segments;
}



const straddlePlane = new Plane();
/**
 * test whether a triangle straddles another triangle plane
 */
function straddles(tri: Triangle, other: Triangle, tolerance: number): boolean {
  other.getPlane(straddlePlane);
  const d = [tri.a, tri.b, tri.c].map((p) => straddlePlane.distanceToPoint(p));
  return Math.min(...d) < -tolerance && Math.max(...d) > tolerance;
}


const REASON: Record<SeamSource, string> = {
  inside_corner: "Inside corner",
  outside_corner: "Outside corner",
  contact: "Plates touch",
  intersection: "Parts intersect",
  edge_chain: "Picked edge",
  drawn: "Drawn by hand",
};

/**
 * convert chained paths into scored seam candidates with stable ids
 */
function toCandidates(paths: SeamPath[], source: SeamSource, jointType: JointType, options: DetectOptions): SeamCandidate[] {

  return paths.filter((p) => p.length >= options.minLength).map((p) => {

    const angleDeg = Math.round(bendAngle(p));
    const confidence = source === "inside_corner" ? (angleDeg >= 75 && angleDeg <= 105 ? 0.9 : 0.7)
      : source === "contact" ? (jointType === "fillet" ? 0.85 : 0.75)
      : source === "intersection" ? 0.8 : 0.5;
    const angleText = source === "inside_corner" || source === "outside_corner" ? `, ${angleDeg}°` : "";

    return { ...p, id: seamId(source, p), source, jointType, angleDeg, confidence, reason: REASON[source] + angleText };
  });
}

/**
 * compute dihedral bend angle in degrees from path face normals
 */
function bendAngle(p: SeamPath): number {
  const n = dot([p.normalsA[0]!, p.normalsA[1]!, p.normalsA[2]!], [p.normalsB[0]!, p.normalsB[1]!, p.normalsB[2]!]);
  return (Math.acos(Math.max(-1, Math.min(1, n))) * 180) / Math.PI;
}


/**
 * Stable across re-runs and reversal: built from the rounded, sorted end points (or centroid for
 * loops), the length and the midpoint.
 * build a stable seam id from rounded endpoints, length and midpoint
 */
export function seamId(source: SeamSource, p: SeamPath): string {

  const r = (v: number) => Math.round(v * 100) / 100;
  const count = p.points.length / 3;
  const at = (i: number) => [r(p.points[i * 3]!), r(p.points[i * 3 + 1]!), r(p.points[i * 3 + 2]!)].join(",");

  let key: string;

  if (p.closed) {
    let cx = 0, cy = 0, cz = 0;
    for (let i = 0; i < count; i++) { cx += p.points[i * 3]!; cy += p.points[i * 3 + 1]!; cz += p.points[i * 3 + 2]!; }
    key = `${source}|loop|${r(cx / count)},${r(cy / count)},${r(cz / count)}|${r(p.length)}`;
  } else {
    const lo = Math.floor((count - 1) / 2), hi = Math.ceil((count - 1) / 2);
    const mid = [0, 1, 2].map((k) => r((p.points[lo * 3 + k]! + p.points[hi * 3 + k]!) / 2)).join(",");
    key = `${source}|${[at(0), at(count - 1)].sort().join("|")}|${r(p.length)}|${mid}`;
  }

  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) hash = Math.imul(hash ^ key.charCodeAt(i), 0x01000193);
  return `seam_${(hash >>> 0).toString(16).padStart(8, "0")}`;
}


/**
 * The same line found by two methods (e.g. contact and intersection) keeps the more confident one.
 * remove duplicate candidates covering the same line, keeping confident ones
 */
function dedupe(candidates: SeamCandidate[], distance: number): SeamCandidate[] {

  const sorted = [...candidates].sort((a, b) => b.confidence - a.confidence);
  const kept: SeamCandidate[] = [];
  const seen = new Set<string>();

  for (const c of sorted) {
    if (seen.has(c.id)) continue;
    if (kept.some((k) => Math.abs(k.length - c.length) <= 0.15 * Math.max(k.length, c.length) && lies(c, k, distance))) continue;
    seen.add(c.id);
    kept.push(c);
  }

  return candidates.filter((c) => kept.includes(c));
}

/**
 * The same line, e.g. a picked edge that a detected candidate also follows.
 * test whether two paths follow each other within tolerance both ways
 */
export function samePath(a: SeamPath, b: SeamPath, distance: number): boolean {
  return Math.abs(a.length - b.length) <= 0.15 * Math.max(a.length, b.length) && lies(a, b, distance) && lies(b, a, distance);
}

/**
 * test whether every point of one path lies near another path
 */
function lies(a: SeamPath, on: SeamPath, distance: number): boolean {
  for (let i = 0; i < a.points.length; i += 3) {
    if (distanceToPolyline([a.points[i]!, a.points[i + 1]!, a.points[i + 2]!], on) > distance) return false;
  }
  return true;
}

/**
 * compute shortest distance from a point to a seam polyline
 */
export function distanceToPolyline(p: number[], path: SeamPath): number {

  const count = path.points.length / 3;
  const segmentCount = path.closed ? count : count - 1;
  let best = Infinity;

  if (count === 1) return len(sub(p, [path.points[0]!, path.points[1]!, path.points[2]!]));

  for (let i = 0; i < segmentCount; i++) {
    const j = (i + 1) % count;
    const a = [path.points[i * 3]!, path.points[i * 3 + 1]!, path.points[i * 3 + 2]!];
    const b = [path.points[j * 3]!, path.points[j * 3 + 1]!, path.points[j * 3 + 2]!];
    const ab = sub(b, a);
    const t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / (dot(ab, ab) || 1)));
    best = Math.min(best, len(sub(p, [a[0]! + ab[0] * t, a[1]! + ab[1] * t, a[2]! + ab[2] * t])));
  }

  return best;
}
