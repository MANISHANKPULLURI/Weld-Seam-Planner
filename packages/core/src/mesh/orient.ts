import { BufferAttribute, BufferGeometry, DoubleSide, Ray, Vector3 } from "three";
import { MeshBVH } from "three-mesh-bvh";
import { BOUNDARY } from "./topology.ts";
import type { Topology } from "./topology.ts";
import { diagonalOf } from "./bounds.ts";

export type OrientResult = {
  indices: Uint32Array;
  flipped: number;
  conflicts: number;
  patches: number;
};

export type OrientOptions = { rayVote?: boolean; onProgress?: (fraction: number) => void };

const RAY_SAMPLES = 24;

// Winding is propagated only across manifold edges. Closed patches are turned outward by signed
// volume. Open patches are tested with rays cast both ways from sample faces: a ray that leaves an
// odd number of surfaces behind it started inside. Patches with no usable rays keep the
// orientation most of their original faces already had.
export function orientFaces(vertices: Float32Array, indices: Uint32Array, topology: Topology, options: OrientOptions = {}): OrientResult {

  const faceCount = indices.length / 3;
  const rayVote = options.rayVote ?? true;
  const onProgress = options.onProgress ?? (() => {});

  const flip = new Uint8Array(faceCount);
  const visited = new Uint8Array(faceCount);
  const queue = new Int32Array(faceCount);
  const diagonal = diagonalOf(vertices);

  let bvh: MeshBVH | null = null;
  let conflicts = 0;
  let patches = 0;
  let processed = 0;

  for (let seed = 0; seed < faceCount; seed++) {

    if (visited[seed]) continue;

    patches++;
    visited[seed] = 1;

    let head = 0;
    let tail = 0;
    let open = false;

    queue[tail++] = seed;

    while (head < tail) {

      const f = queue[head++]!;

      for (let k = 0; k < 3; k++) {

        const h = f * 3 + k;
        const t = topology.twin[h]!;

        if (t === BOUNDARY) { open = true; continue; }
        if (t < 0) continue;

        const g = (t / 3) | 0;
        const sameDirection = indices[h] === indices[t];
        const required = sameDirection ? 1 - flip[f]! : flip[f]!;

        if (visited[g]) {
          if (flip[g] !== required) conflicts++;
          continue;
        }

        flip[g] = required;
        visited[g] = 1;
        queue[tail++] = g;
      }
    }

    let invert: boolean;

    if (!open) {
      invert = signedVolume(vertices, indices, queue, tail, flip) < 0;
    } else {
      let vote = 0;
      if (rayVote && tail >= 4) {
        bvh ??= buildBvh(vertices, indices);
        vote = rayVotes(vertices, indices, queue, tail, flip, bvh, diagonal);
      }
      if (vote !== 0) {
        invert = vote < 0;
      } else {
        let flippedInPatch = 0;
        for (let i = 0; i < tail; i++) flippedInPatch += flip[queue[i]!]!;
        invert = flippedInPatch * 2 > tail;
      }
    }

    if (invert) {
      for (let i = 0; i < tail; i++) flip[queue[i]!] = 1 - flip[queue[i]!]!;
    }

    processed += tail;
    onProgress(processed / faceCount);
  }

  const oriented = indices.slice();
  let flipped = 0;

  for (let f = 0; f < faceCount; f++) {
    if (!flip[f]) continue;
    flipped++;
    const tmp = oriented[f * 3 + 1]!;
    oriented[f * 3 + 1] = oriented[f * 3 + 2]!;
    oriented[f * 3 + 2] = tmp;
  }

  return { indices: oriented, flipped, conflicts: conflicts / 2, patches };
}


function buildBvh(vertices: Float32Array, indices: Uint32Array): MeshBVH {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(vertices, 3));
  geometry.setIndex(new BufferAttribute(indices, 1));
  return new MeshBVH(geometry, { indirect: true });
}


// Positive result: most informative samples face outward. Negative: most face inward.
function rayVotes(vertices: Float32Array, indices: Uint32Array, faces: Int32Array, count: number, flip: Uint8Array, bvh: MeshBVH, diagonal: number): number {

  const stride = Math.max(1, Math.floor(count / RAY_SAMPLES));
  const eps = Math.max(diagonal * 1e-6, 1e-9);
  const ray = new Ray();
  const point = new Vector3();
  const normal = new Vector3();

  let outward = 0;
  let inward = 0;

  for (let i = 0; i < count; i += stride) {

    const f = faces[i]!;
    const a = indices[f * 3]! * 3;
    const b = indices[f * 3 + (flip[f] ? 2 : 1)]! * 3;
    const c = indices[f * 3 + (flip[f] ? 1 : 2)]! * 3;

    const ux = vertices[b]! - vertices[a]!, uy = vertices[b + 1]! - vertices[a + 1]!, uz = vertices[b + 2]! - vertices[a + 2]!;
    const vx = vertices[c]! - vertices[a]!, vy = vertices[c + 1]! - vertices[a + 1]!, vz = vertices[c + 2]! - vertices[a + 2]!;

    normal.set(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
    if (normal.lengthSq() === 0) continue;
    normal.normalize();

    point.set(
      vertices[a]! * 0.31 + vertices[b]! * 0.33 + vertices[c]! * 0.36,
      vertices[a + 1]! * 0.31 + vertices[b + 1]! * 0.33 + vertices[c + 1]! * 0.36,
      vertices[a + 2]! * 0.31 + vertices[b + 2]! * 0.33 + vertices[c + 2]! * 0.36,
    );

    const front = crossings(bvh, ray, point, normal, eps);
    const back = crossings(bvh, ray, point, normal.negate(), eps);

    if (front % 2 === 1 && back % 2 === 0) inward++;
    else if (front % 2 === 0 && back % 2 === 1) outward++;
  }

  return outward - inward;
}


function crossings(bvh: MeshBVH, ray: Ray, origin: Vector3, direction: Vector3, eps: number): number {

  ray.origin.copy(origin).addScaledVector(direction, eps);
  ray.direction.copy(direction);

  const hits = bvh.raycast(ray, DoubleSide).map((hit) => hit.distance).sort((p, q) => p - q);

  let count = 0;
  let last = -Infinity;

  for (const d of hits) {
    if (d - last > eps * 4) count++;
    last = d;
  }

  return count;
}


function signedVolume(vertices: Float32Array, indices: Uint32Array, faces: Int32Array, count: number, flip: Uint8Array): number {

  let cx = 0, cy = 0, cz = 0;

  for (let i = 0; i < count; i++) {
    const f = faces[i]!;
    for (let k = 0; k < 3; k++) {
      const v = indices[f * 3 + k]! * 3;
      cx += vertices[v]!; cy += vertices[v + 1]!; cz += vertices[v + 2]!;
    }
  }

  cx /= count * 3; cy /= count * 3; cz /= count * 3;

  let volume = 0;

  for (let i = 0; i < count; i++) {

    const f = faces[i]!;
    const a = indices[f * 3]! * 3;
    const b = indices[f * 3 + (flip[f] ? 2 : 1)]! * 3;
    const c = indices[f * 3 + (flip[f] ? 1 : 2)]! * 3;

    const ax = vertices[a]! - cx, ay = vertices[a + 1]! - cy, az = vertices[a + 2]! - cz;
    const bx = vertices[b]! - cx, by = vertices[b + 1]! - cy, bz = vertices[b + 2]! - cz;
    const qx = vertices[c]! - cx, qy = vertices[c + 1]! - cy, qz = vertices[c + 2]! - cz;

    volume += ax * (by * qz - bz * qy) - ay * (bx * qz - bz * qx) + az * (bx * qy - by * qx);
  }

  return volume / 6;
}

