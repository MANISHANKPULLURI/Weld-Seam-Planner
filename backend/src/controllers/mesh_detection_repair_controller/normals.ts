import type { OrientationResult } from "./types.ts";


// Winding is propagated only across manifold edges. Closed patches are turned outward by
// signed volume; open patches keep whichever orientation most original faces already had.
export function orientConsistently(uniqueVertices: Float32Array, indexArray: Int32Array): OrientationResult {

  const faceCount = indexArray.length / 3;
  const vertexCount = uniqueVertices.length / 3;

  const edgeIdByKey = new Map<number, number>();
  const edgeFace0: number[] = [];
  const edgeFace1: number[] = [];
  const edgeUses: number[] = [];

  const faceEdge = new Int32Array(faceCount * 3);
  const faceEdgeForward = new Uint8Array(faceCount * 3);

  for (let f = 0; f < faceCount; f++) {

    for (let k = 0; k < 3; k++) {

      const a = indexArray[f * 3 + k]!;
      const b = indexArray[f * 3 + ((k + 1) % 3)]!;

      const low = a < b ? a : b;
      const high = a < b ? b : a;
      const key = low * vertexCount + high;

      let edgeId = edgeIdByKey.get(key);

      if (edgeId === undefined) {
        edgeId = edgeFace0.length;
        edgeIdByKey.set(key, edgeId);
        edgeFace0.push(f);
        edgeFace1.push(-1);
        edgeUses.push(1);
      } else {
        if (edgeUses[edgeId] === 1) edgeFace1[edgeId] = f;
        edgeUses[edgeId]!++;
      }

      faceEdge[f * 3 + k] = edgeId;
      faceEdgeForward[f * 3 + k] = a < b ? 1 : 0;
    }
  }

  const flip = new Uint8Array(faceCount);
  const visited = new Uint8Array(faceCount);
  const queue = new Int32Array(faceCount);

  let conflicts = 0;

  for (let seed = 0; seed < faceCount; seed++) {

    if (visited[seed]) continue;

    visited[seed] = 1;

    let head = 0;
    let tail = 0;

    queue[tail++] = seed;

    let patchOpen = false;

    while (head < tail) {

      const f = queue[head++]!;

      for (let k = 0; k < 3; k++) {

        const edgeId = faceEdge[f * 3 + k]!;
        const uses = edgeUses[edgeId]!;

        if (uses === 1) {
          patchOpen = true;
          continue;
        }

        if (uses !== 2) continue;

        const g = edgeFace0[edgeId] === f ? edgeFace1[edgeId]! : edgeFace0[edgeId]!;

        let gForward = 0;

        for (let j = 0; j < 3; j++) {
          if (faceEdge[g * 3 + j] === edgeId) gForward = faceEdgeForward[g * 3 + j]!;
        }

        const fForward = faceEdgeForward[f * 3 + k]!;
        const required = gForward === fForward ? 1 - flip[f]! : flip[f]!;

        if (visited[g]) {
          if (flip[g] !== required) conflicts++;
          continue;
        }

        flip[g] = required;
        visited[g] = 1;
        queue[tail++] = g;
      }
    }

    let invertPatch = false;

    if (patchOpen) {

      let flippedInPatch = 0;

      for (let i = 0; i < tail; i++) flippedInPatch += flip[queue[i]!]!;

      invertPatch = flippedInPatch * 2 > tail;

    } else {

      invertPatch = signedVolume(uniqueVertices, indexArray, queue, tail, flip) < 0;
    }

    if (invertPatch) {
      for (let i = 0; i < tail; i++) flip[queue[i]!] = 1 - flip[queue[i]!]!;
    }
  }

  const oriented = indexArray.slice();

  let flipped = 0;

  for (let f = 0; f < faceCount; f++) {

    if (!flip[f]) continue;

    flipped++;

    const tmp = oriented[f * 3 + 1]!;
    oriented[f * 3 + 1] = oriented[f * 3 + 2]!;
    oriented[f * 3 + 2] = tmp;
  }

  return { indexArray: oriented, flipped, conflicts: conflicts / 2 };
}


function signedVolume(vertices: Float32Array, indices: Int32Array, faces: Int32Array, count: number, flip: Uint8Array): number {

  let cx = 0;
  let cy = 0;
  let cz = 0;

  for (let i = 0; i < count; i++) {

    const f = faces[i]!;

    for (let k = 0; k < 3; k++) {
      const v = indices[f * 3 + k]! * 3;
      cx += vertices[v]!;
      cy += vertices[v + 1]!;
      cz += vertices[v + 2]!;
    }
  }

  cx /= count * 3;
  cy /= count * 3;
  cz /= count * 3;

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
