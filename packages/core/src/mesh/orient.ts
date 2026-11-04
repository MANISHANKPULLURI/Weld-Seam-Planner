import type { Topology } from "./topology.ts";

export type OrientResult = {
  indices: Uint32Array;
  flipped: number;
  inconsistentEdges: number;
  patches: number;
};

// fileNormals: the normals stored in the STL, one per triangle (zero when missing).
// islands: false skips island flipping, for meshes that are already oriented (repair).
export type OrientOptions = { onProgress?: (fraction: number) => void; fileNormals?: Float32Array | null; islands?: boolean };

type Patch = { faces: number[]; open: number; neighbours: Map<number, number>; min: number[]; max: number[] };

// Components are faces joined across manifold edges.
// - A closed component (a watertight shell) gets classic winding propagation, then the file's majority
//   winding, then signed volume: negative volume flips it, unless it sits inside another shell (a cavity).
// - An open component (cracks, assemblies) is split into patches whose winding already agrees; a patch
//   flips only when at least half of its border disagrees with one larger patch, i.e. an island of
//   reversed faces. Propagating across assembly junctions flipped 22% of a correctly wound 108-body
//   file (ray voting did no better), so open parts keep the file's winding everywhere else.
export function orientFaces(vertices: Float32Array, indices: Uint32Array, topology: Topology, options: OrientOptions = {}): OrientResult {

  const faceCount = indices.length / 3;
  const onProgress = options.onProgress ?? (() => {});
  const twin = topology.twin;

  const usable = new Uint8Array(faceCount * 3);
  for (let h = 0; h < faceCount * 3; h++) {
    const t = twin[h]!;
    if (t > h && !folded(vertices, indices, h, t)) usable[h] = usable[t] = 1;
  }

  const component = new Int32Array(faceCount).fill(-1);
  const flip = new Uint8Array(faceCount);
  const closedShells: Patch[] = [];
  const shellFaces: number[][] = [];
  const openComponents: number[][] = [];
  const stack: number[] = [];
  let inconsistentEdges = 0;

  for (let seed = 0; seed < faceCount; seed++) {

    if (component[seed]! >= 0) continue;

    const id = closedShells.length + openComponents.length;
    const faces: number[] = [];
    let closed = true;
    component[seed] = id;
    stack.push(seed);

    while (stack.length) {
      const f = stack.pop()!;
      faces.push(f);
      for (let k = 0; k < 3; k++) {
        const h = f * 3 + k;
        if (!usable[h]) { closed = false; continue; }
        const t = twin[h]!, g = (t / 3) | 0;
        if (indices[h] === indices[t] && h < t) inconsistentEdges++;
        if (component[g]! < 0) { component[g] = id; stack.push(g); }
      }
    }

    if (closed) { shellFaces.push(faces); closedShells.push({ faces, open: 0, neighbours: new Map(), ...boundsOf(vertices, indices, faces) }); }
    else openComponents.push(faces);
  }

  onProgress(0.3);

  closedShells.forEach((shell) => propagate(shell.faces, indices, twin, flip));

  for (const shell of closedShells) {
    if (signedVolume(vertices, indices, shell.faces, flip) < 0 && !closedShells.some((other) => other !== shell && contains(other, shell) && inside(shell, other, vertices, indices))) {
      for (const f of shell.faces) flip[f] = 1 - flip[f]!;
    }
  }

  onProgress(0.6);

  if (options.islands !== false) for (const faces of openComponents) flipIslands(faces, vertices, indices, twin, usable, flip, options.fileNormals ?? null);

  onProgress(1);

  const oriented = indices.slice();
  let flipped = 0;

  for (let f = 0; f < faceCount; f++) {
    if (!flip[f]) continue;
    flipped++;
    const tmp = oriented[f * 3 + 1]!;
    oriented[f * 3 + 1] = oriented[f * 3 + 2]!;
    oriented[f * 3 + 2] = tmp;
  }

  return { indices: oriented, flipped, inconsistentEdges, patches: closedShells.length + openComponents.length };
}


// Breadth-first winding propagation from the first face, then keep whichever way most faces already were.
function propagate(faces: number[], indices: Uint32Array, twin: Int32Array, flip: Uint8Array) {

  const seen = new Set<number>([faces[0]!]);
  const queue = [faces[0]!];

  for (let i = 0; i < queue.length; i++) {
    const f = queue[i]!;
    for (let k = 0; k < 3; k++) {
      const h = f * 3 + k, t = twin[h]!;
      if (t < 0) continue;
      const g = (t / 3) | 0;
      if (seen.has(g)) continue;
      seen.add(g);
      flip[g] = indices[h] === indices[t] ? 1 - flip[f]! : flip[f]!;
      queue.push(g);
    }
  }

  let flipped = 0;
  for (const f of faces) flipped += flip[f]!;
  if (flipped * 2 > faces.length) for (const f of faces) flip[f] = 1 - flip[f]!;
}


function flipIslands(faces: number[], vertices: Float32Array, indices: Uint32Array, twin: Int32Array, usable: Uint8Array, flip: Uint8Array, fileNormals: Float32Array | null) {

  const patchOf = new Map<number, number>();
  const patches: Patch[] = [];

  for (const seed of faces) {
    if (patchOf.has(seed)) continue;
    const id = patches.length;
    const members: number[] = [];
    const stack = [seed];
    patchOf.set(seed, id);
    while (stack.length) {
      const f = stack.pop()!;
      members.push(f);
      for (let k = 0; k < 3; k++) {
        const h = f * 3 + k, t = twin[h]!;
        if (!usable[h] || indices[h] === indices[t]) continue;
        const g = (t / 3) | 0;
        if (!patchOf.has(g)) { patchOf.set(g, id); stack.push(g); }
      }
    }
    patches.push({ faces: members, open: 0, neighbours: new Map(), min: [], max: [] });
  }

  if (patches.length === 1) return;

  // Only smooth borders vote: a reversed island inside a surface continues it, while a sharp
  // disagreeing border is a junction between parts and counts as open.
  for (const f of faces) {
    const patch = patches[patchOf.get(f)!]!;
    for (let k = 0; k < 3; k++) {
      const h = f * 3 + k;
      if (!usable[h]) { patch.open++; continue; }
      const other = patchOf.get((twin[h]! / 3) | 0)!;
      if (other === patchOf.get(f)) continue;
      if (bend(vertices, indices, h, twin[h]!) > -0.866) patch.open++;
      else patch.neighbours.set(other, (patch.neighbours.get(other) ?? 0) + 1);
    }
  }

  const reversed = new Uint8Array(patches.length);
  const order = patches.map((_, i) => i).sort((a, b) => patches[a]!.faces.length - patches[b]!.faces.length);

  for (const id of order) {
    const p = patches[id]!;
    let total = p.open, bestCount = 0, best = -1;
    for (const [other, count] of p.neighbours) {
      total += count;
      if (count > bestCount) { bestCount = count; best = other; }
    }
    if (best >= 0 && bestCount * 2 >= total && p.faces.length <= patches[best]!.faces.length && !fileAgrees(p.faces, vertices, indices, fileNormals)) reversed[id] = reversed[best] ? 0 : 1;
  }

  patches.forEach((p, id) => { if (reversed[id]) for (const f of p.faces) flip[f] = 1; });
}


// CAD exporters usually write normals from the true surface, so normals that agree with the
// winding mean the winding is intentional. No stored normals (all zero) is no evidence either way.
function fileAgrees(faces: number[], vertices: Float32Array, indices: Uint32Array, fileNormals: Float32Array | null): boolean {
  if (!fileNormals) return false;
  let agree = 0, disagree = 0;
  for (const f of faces) {
    const a = indices[f * 3]! * 3, b = indices[f * 3 + 1]! * 3, c = indices[f * 3 + 2]! * 3;
    const ux = vertices[b]! - vertices[a]!, uy = vertices[b + 1]! - vertices[a + 1]!, uz = vertices[b + 2]! - vertices[a + 2]!;
    const vx = vertices[c]! - vertices[a]!, vy = vertices[c + 1]! - vertices[a + 1]!, vz = vertices[c + 2]! - vertices[a + 2]!;
    const d = (uy * vz - uz * vy) * fileNormals[f * 3]! + (uz * vx - ux * vz) * fileNormals[f * 3 + 1]! + (ux * vy - uy * vx) * fileNormals[f * 3 + 2]!;
    if (d > 0) agree++; else if (d < 0) disagree++;
  }
  return agree > disagree;
}

// The two triangles fold onto the same side of their shared edge: two parts touching back to back,
// not one surface. Decided from geometry, so it does not depend on the (possibly wrong) winding.
function folded(vertices: Float32Array, indices: Uint32Array, h: number, t: number): boolean {
  return bend(vertices, indices, h, t) > 0.95;
}

// Cosine between the two triangles' directions away from their shared edge, from geometry alone:
// -1 means one flat surface continuing, 0 a right-angle corner, +1 folded flat onto each other.
function bend(vertices: Float32Array, indices: Uint32Array, h: number, t: number): number {

  const f = (h / 3) | 0, g = (t / 3) | 0;
  const a = indices[h]!, b = indices[f * 3 + ((h % 3) + 1) % 3]!;
  const p = opposite(indices, f, a, b), q = opposite(indices, g, a, b);

  const ex = vertices[b * 3]! - vertices[a * 3]!, ey = vertices[b * 3 + 1]! - vertices[a * 3 + 1]!, ez = vertices[b * 3 + 2]! - vertices[a * 3 + 2]!;
  const ee = ex * ex + ey * ey + ez * ez || 1;

  const perp = (v: number) => {
    const dx = vertices[v * 3]! - vertices[a * 3]!, dy = vertices[v * 3 + 1]! - vertices[a * 3 + 1]!, dz = vertices[v * 3 + 2]! - vertices[a * 3 + 2]!;
    const along = (dx * ex + dy * ey + dz * ez) / ee;
    return [dx - along * ex, dy - along * ey, dz - along * ez];
  };

  const u = perp(p), w = perp(q);
  const d = u[0]! * w[0]! + u[1]! * w[1]! + u[2]! * w[2]!;
  return d / (Math.sqrt((u[0]! ** 2 + u[1]! ** 2 + u[2]! ** 2) * (w[0]! ** 2 + w[1]! ** 2 + w[2]! ** 2)) || 1);
}

function opposite(indices: Uint32Array, face: number, a: number, b: number): number {
  for (let k = 0; k < 3; k++) {
    const v = indices[face * 3 + k]!;
    if (v !== a && v !== b) return v;
  }
  return indices[face * 3]!;
}

// A cavity wall lies entirely inside the other shell: checked with the generalized winding number
// (sum of solid angles, Van Oosterom & Strackee 1983) at a few of its vertices. Bounding boxes alone
// were not enough: a rotated tube's box fits inside a crossing plate's box.
function inside(inner: Patch, outer: Patch, vertices: Float32Array, indices: Uint32Array): boolean {
  const step = Math.max(1, Math.floor(inner.faces.length / 3));
  for (let i = 0; i < inner.faces.length; i += step) {
    const v = indices[inner.faces[i]! * 3]! * 3;
    if (Math.abs(windingNumber(vertices[v]!, vertices[v + 1]!, vertices[v + 2]!, outer.faces, vertices, indices)) < 0.5) return false;
  }
  return true;
}

function windingNumber(px: number, py: number, pz: number, faces: number[], vertices: Float32Array, indices: Uint32Array): number {
  let total = 0;
  for (const f of faces) {
    const a = indices[f * 3]! * 3, b = indices[f * 3 + 1]! * 3, c = indices[f * 3 + 2]! * 3;
    const ax = vertices[a]! - px, ay = vertices[a + 1]! - py, az = vertices[a + 2]! - pz;
    const bx = vertices[b]! - px, by = vertices[b + 1]! - py, bz = vertices[b + 2]! - pz;
    const cx = vertices[c]! - px, cy = vertices[c + 1]! - py, cz = vertices[c + 2]! - pz;
    const la = Math.hypot(ax, ay, az), lb = Math.hypot(bx, by, bz), lc = Math.hypot(cx, cy, cz);
    const det = ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx);
    const div = la * lb * lc + (ax * bx + ay * by + az * bz) * lc + (bx * cx + by * cy + bz * cz) * la + (cx * ax + cy * ay + cz * az) * lb;
    total += 2 * Math.atan2(det, div);
  }
  return total / (4 * Math.PI);
}

function contains(outer: Patch, inner: Patch): boolean {
  return [0, 1, 2].every((k) => outer.min[k]! <= inner.min[k]! && outer.max[k]! >= inner.max[k]!) &&
    [0, 1, 2].some((k) => outer.min[k]! < inner.min[k]! || outer.max[k]! > inner.max[k]!);
}

function boundsOf(vertices: Float32Array, indices: Uint32Array, faces: number[]) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const f of faces) {
    for (let k = 0; k < 3; k++) {
      const v = indices[f * 3 + k]! * 3;
      for (let a = 0; a < 3; a++) {
        const x = vertices[v + a]!;
        if (x < min[a]!) min[a] = x;
        if (x > max[a]!) max[a] = x;
      }
    }
  }
  return { min, max };
}

function signedVolume(vertices: Float32Array, indices: Uint32Array, faces: number[], flip: Uint8Array): number {

  let cx = 0, cy = 0, cz = 0;

  for (const f of faces) {
    for (let k = 0; k < 3; k++) {
      const v = indices[f * 3 + k]! * 3;
      cx += vertices[v]!; cy += vertices[v + 1]!; cz += vertices[v + 2]!;
    }
  }

  const n = faces.length * 3;
  cx /= n; cy /= n; cz /= n;

  let volume = 0;

  for (const f of faces) {
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
