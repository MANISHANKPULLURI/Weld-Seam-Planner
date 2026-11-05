import { diagonalOf } from "./bounds.ts";

export type WeldResult = {
  vertices: Float32Array;
  indices: Uint32Array;
  fileNormals: Float32Array | null;
  tolerance: number;
  degenerateRemoved: number;
  duplicateRemoved: number;
};

/**
 * derive default weld tolerance from a mesh diagonal
 */
export function defaultWeldTolerance(diagonal: number): number {
  return Math.max(diagonal * 1e-6, 1e-9);
}



/**
 * merge duplicate vertices and drop degenerate and duplicate triangles
 */
export function weldVertices(positions: Float32Array, tolerance?: number, onProgress: (f: number) => void = () => {}, normals: Float32Array | null = null): WeldResult {

  const rawCount = positions.length / 3;
  const diagonal = diagonalOf(positions);
  const tol = tolerance ?? defaultWeldTolerance(diagonal);
  const inverseCell = 1 / (tol * 2);
  const tolSq = tol * tol;

  const capacity = nextPow2(Math.max(16, rawCount * 2));
  const mask = capacity - 1;
  const table = new Int32Array(capacity).fill(-1);

  const out = new Float32Array(rawCount * 3);
  const cellX = new Float64Array(rawCount);
  const cellY = new Float64Array(rawCount);
  const cellZ = new Float64Array(rawCount);
  const remap = new Uint32Array(rawCount);
  const step = Math.max(1, Math.floor(rawCount / 25));

  let unique = 0;

  for (let i = 0; i < rawCount; i++) {

    const x = positions[i * 3]!, y = positions[i * 3 + 1]!, z = positions[i * 3 + 2]!;
    const fx = x * inverseCell, fy = y * inverseCell, fz = z * inverseCell;
    const gx = Math.floor(fx), gy = Math.floor(fy), gz = Math.floor(fz);
    const nx = fx - gx < 0.5 ? gx - 1 : gx + 1;
    const ny = fy - gy < 0.5 ? gy - 1 : gy + 1;
    const nz = fz - gz < 0.5 ? gz - 1 : gz + 1;

    let found = -1;

    for (let corner = 0; corner < 8 && found < 0; corner++) {

      const cx = corner & 1 ? nx : gx;
      const cy = corner & 2 ? ny : gy;
      const cz = corner & 4 ? nz : gz;

      let slot = hashCell(cx, cy, cz) & mask;

      while (table[slot] !== -1) {

        const v = table[slot]!;

        if (cellX[v] === cx && cellY[v] === cy && cellZ[v] === cz) {
          const dx = out[v * 3]! - x, dy = out[v * 3 + 1]! - y, dz = out[v * 3 + 2]! - z;
          if (dx * dx + dy * dy + dz * dz <= tolSq) { found = v; break; }
        }

        slot = (slot + 1) & mask;
      }
    }

    if (found < 0) {

      found = unique++;
      out[found * 3] = x; out[found * 3 + 1] = y; out[found * 3 + 2] = z;
      cellX[found] = gx; cellY[found] = gy; cellZ[found] = gz;

      let slot = hashCell(gx, gy, gz) & mask;
      while (table[slot] !== -1) slot = (slot + 1) & mask;
      table[slot] = found;
    }

    remap[i] = found;

    if (i % step === 0) onProgress(i / rawCount * 0.8);
  }

  const vertices = out.slice(0, unique * 3);
  const triangleCount = rawCount / 3;
  const areaEpsSq = (diagonal * diagonal * 1e-14) ** 2;

  const kept = new Uint32Array(triangleCount * 3);
  const keptNormals = normals ? new Float32Array(triangleCount * 3) : null;
  const triCapacity = nextPow2(Math.max(16, triangleCount * 2));
  const triMask = triCapacity - 1;
  const triTable = new Int32Array(triCapacity).fill(-1);

  let keptCount = 0;
  let degenerateRemoved = 0;
  let duplicateRemoved = 0;

  for (let t = 0; t < triangleCount; t++) {

    const a = remap[t * 3]!, b = remap[t * 3 + 1]!, c = remap[t * 3 + 2]!;

    if (a === b || b === c || a === c || areaSq(vertices, a, b, c) <= areaEpsSq) {
      degenerateRemoved++;
      continue;
    }

    const lo = Math.min(a, b, c), hi = Math.max(a, b, c), mid = a + b + c - lo - hi;
    let slot = hashCell(lo, mid, hi) & triMask;
    let duplicate = false;

    while (triTable[slot] !== -1) {

      const k = triTable[slot]! * 3;
      const p = kept[k]!, q = kept[k + 1]!, r = kept[k + 2]!;
      const klo = Math.min(p, q, r), khi = Math.max(p, q, r);

      if (klo === lo && khi === hi && p + q + r - klo - khi === mid) { duplicate = true; break; }

      slot = (slot + 1) & triMask;
    }

    if (duplicate) {
      duplicateRemoved++;
      continue;
    }

    triTable[slot] = keptCount;
    kept[keptCount * 3] = a; kept[keptCount * 3 + 1] = b; kept[keptCount * 3 + 2] = c;
    keptNormals?.set(normals!.subarray(t * 3, t * 3 + 3), keptCount * 3);
    keptCount++;
  }

  onProgress(1);

  return { vertices, indices: kept.slice(0, keptCount * 3), fileNormals: keptNormals ? keptNormals.slice(0, keptCount * 3) : null, tolerance: tol, degenerateRemoved, duplicateRemoved };
}


/**
 * compute squared area of a triangle for degeneracy testing
 */
function areaSq(v: Float32Array, a: number, b: number, c: number): number {
  const ax = v[b * 3]! - v[a * 3]!, ay = v[b * 3 + 1]! - v[a * 3 + 1]!, az = v[b * 3 + 2]! - v[a * 3 + 2]!;
  const bx = v[c * 3]! - v[a * 3]!, by = v[c * 3 + 1]! - v[a * 3 + 1]!, bz = v[c * 3 + 2]! - v[a * 3 + 2]!;
  const nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
  return nx * nx + ny * ny + nz * nz;
}

/**
 * hash integer cell coordinates for the weld lookup table
 */
function hashCell(x: number, y: number, z: number): number {
  return (Math.imul(x | 0, 73856093) ^ Math.imul(y | 0, 19349663) ^ Math.imul(z | 0, 83492791)) >>> 0;
}

/**
 * round up to the next power of two for hash table sizing
 */
function nextPow2(n: number): number {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}
