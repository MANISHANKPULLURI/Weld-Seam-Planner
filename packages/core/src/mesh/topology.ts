export const BOUNDARY = -1;
export const NON_MANIFOLD = -2;


export type Topology = {
  faceCount: number;
  edgeCount: number;
  twin: Int32Array;
  edgeOf: Int32Array;
  edgeUses: Uint32Array;
  openEdges: number;
  nonManifold: number;
};

/**
 * return the end vertex of a half-edge within its triangle
 */
export function halfEdgeEnd(indices: Uint32Array, h: number): number {
  return indices[h - (h % 3) + ((h % 3) + 1) % 3]!;
}

/**
 * build half-edge topology with twin, edges and open counts
 */
export function buildTopology(indices: Uint32Array, vertexCount: number): Topology {

  const faceCount = indices.length / 3;
  const halfEdges = indices.length;

  const offsets = new Uint32Array(vertexCount + 1);

  for (let h = 0; h < halfEdges; h++) {
    const a = indices[h]!, b = halfEdgeEnd(indices, h);
    offsets[(a < b ? a : b) + 1]!++;
  }

  for (let v = 0; v < vertexCount; v++) offsets[v + 1]! += offsets[v]!;

  const cursor = offsets.slice(0, vertexCount);
  const bucket = new Int32Array(halfEdges);

  for (let h = 0; h < halfEdges; h++) {
    const a = indices[h]!, b = halfEdgeEnd(indices, h);
    bucket[cursor[a < b ? a : b]!++] = h;
  }

  const twin = new Int32Array(halfEdges);
  const edgeOf = new Int32Array(halfEdges);
  const uses: number[] = [];

  let openEdges = 0;
  let nonManifold = 0;

  const other = (h: number) => {
    const a = indices[h]!, b = halfEdgeEnd(indices, h);
    return a < b ? b : a;
  };

  for (let v = 0; v < vertexCount; v++) {

    const start = offsets[v]!, end = offsets[v + 1]!;
    if (start === end) continue;

    const group = Array.from(bucket.subarray(start, end));
    if (group.length > 1) group.sort((p, q) => other(p) - other(q));

    let i = 0;

    while (i < group.length) {

      const hi = other(group[i]!);
      let j = i + 1;
      while (j < group.length && other(group[j]!) === hi) j++;

      const edge = uses.length;
      const count = j - i;
      uses.push(count);

      for (let k = i; k < j; k++) edgeOf[group[k]!] = edge;

      if (count === 1) {
        twin[group[i]!] = BOUNDARY;
        openEdges++;
      } else if (count === 2) {
        twin[group[i]!] = group[i + 1]!;
        twin[group[i + 1]!] = group[i]!;
      } else {
        for (let k = i; k < j; k++) twin[group[k]!] = NON_MANIFOLD;
        nonManifold++;
      }

      i = j;
    }
  }

  return { faceCount, edgeCount: uses.length, twin, edgeOf, edgeUses: Uint32Array.from(uses), openEdges, nonManifold };
}

/**
 * collect boundary half-edges into a start-to-end registry
 */
export function boundaryRegistry(indices: Uint32Array, topology: Topology): Map<number, number[]> {

  const registry = new Map<number, number[]>();

  for (let h = 0; h < topology.twin.length; h++) {

    if (topology.twin[h] !== BOUNDARY) continue;

    const start = indices[h]!;
    const list = registry.get(start);

    if (list) list.push(halfEdgeEnd(indices, h));
    else registry.set(start, [halfEdgeEnd(indices, h)]);
  }

  return registry;
}



/**
 * group connected triangles into bodies via shared edges and vertices
 */
export function labelBodies(indices: Uint32Array, vertexCount: number, topology: Topology): { bodyOfTriangle: Uint32Array; bodyCount: number } {

  const faceCount = indices.length / 3;
  const parent = new Int32Array(faceCount);
  for (let f = 0; f < faceCount; f++) parent[f] = f;

  const find = (x: number) => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]!]!;
      x = parent[x]!;
    }
    return x;
  };

  const union = (a: number, b: number) => {
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };

  const blocked = new Uint8Array(vertexCount);

  for (let h = 0; h < topology.twin.length; h++) {
    if (topology.twin[h] === NON_MANIFOLD) {
      blocked[indices[h]!] = 1;
      blocked[halfEdgeEnd(indices, h)] = 1;
    }
  }

  const firstFace = new Int32Array(vertexCount).fill(-1);

  for (let h = 0; h < indices.length; h++) {

    const f = (h / 3) | 0;
    const t = topology.twin[h]!;

    if (t >= 0) union(f, (t / 3) | 0);

    const v = indices[h]!;
    if (blocked[v]) continue;

    if (firstFace[v]! < 0) firstFace[v] = f;
    else union(f, firstFace[v]!);
  }

  const bodyOfTriangle = new Uint32Array(faceCount);
  const label = new Int32Array(faceCount).fill(-1);
  let bodyCount = 0;

  for (let f = 0; f < faceCount; f++) {
    const root = find(f);
    if (label[root]! < 0) label[root] = bodyCount++;
    bodyOfTriangle[f] = label[root]!;
  }

  return { bodyOfTriangle, bodyCount };
}
