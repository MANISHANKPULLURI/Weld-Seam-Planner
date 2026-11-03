import type { Diagnostics } from "./types.ts";


export function computeAdjacencyDiagnostics(indexArray: Int32Array): Diagnostics {

  const triangleCount = indexArray.length / 3;

  const edgeTopologyMap = new Map<string, { count: number; rawPairs: { start: number; end: number }[] }>();

  for (let i = 0; i < triangleCount; i++) {

    const v0 = indexArray[i * 3];
    const v1 = indexArray[i * 3 + 1];
    const v2 = indexArray[i * 3 + 2];

    const edges: [number, number][] = [
      [v0, v1],
      [v1, v2],
      [v2, v0],
    ];

    for (const [start, end] of edges) {

      const low = start < end ? start : end;
      const high = start > end ? start : end;

      const key = `${low}_${high}`;

      const record = edgeTopologyMap.get(key) || { count: 0, rawPairs: [] };

      record.count += 1;
      record.rawPairs.push({ start, end });

      edgeTopologyMap.set(key, record);
    }
  }

  let openBoundaryCount = 0;
  let nonManifoldCount = 0;

  const boundaryEdgeRegistry = new Map<number, number[]>();

  for (const data of edgeTopologyMap.values()) {

    if (data.count === 1) {

      openBoundaryCount++;

      const pair = data.rawPairs[0];

      if (!boundaryEdgeRegistry.has(pair.start)) {
        boundaryEdgeRegistry.set(pair.start, []);
      }

      boundaryEdgeRegistry.get(pair.start)!.push(pair.end);

    } else if (data.count > 2) {

      nonManifoldCount++;
    }
  }

  return {
    boundaryEdgeRegistry,
    stats: {
      openBoundaryCount,
      nonManifoldCount,
      isManifoldSolid: openBoundaryCount === 0 && nonManifoldCount === 0,
    },
  };
}


export function computeBounds(uniqueVertices: Float32Array) {

  if (uniqueVertices.length === 0) {
    return { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 }, size: { x: 0, y: 0, z: 0 } };
  }

  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;

  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;

  for (let i = 0; i < uniqueVertices.length; i += 3) {

    const x = uniqueVertices[i];
    const y = uniqueVertices[i + 1];
    const z = uniqueVertices[i + 2];

    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;

    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (z > maxZ) maxZ = z;
  }

  return {
    min: { x: minX, y: minY, z: minZ },
    max: { x: maxX, y: maxY, z: maxZ },
    size: { x: maxX - minX, y: maxY - minY, z: maxZ - minZ },
  };
}


export function estimateBodies(indexArray: Int32Array): number {
  const n = indexArray.length / 3;
  if (n === 0) return 0;
  const parent = new Int32Array(n);
  for (let i = 0; i < n; i++) parent[i] = i;
  function find(x: number): number {
    while (parent[x] !== x) {
      const p = parent[x]!;
      const gp = parent[p]!;
      if (p !== gp) parent[x] = gp;
      x = parent[x]!;
    }
    return x;
  }
  function union(a: number, b: number) {
    a = find(a);
    b = find(b);
    if (a !== b) parent[a] = b;
  }
  const vmap = new Map<number, number>();
  const vFirst = new Map<number, number>();
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < 3; k++) {
      const v = indexArray[i * 3 + k]!;
      const first = vFirst.get(v);
      if (first !== undefined) {
        union(i, first);
      } else {
        vFirst.set(v, i);
      }
      vmap.set(v, (vmap.get(v) || 0) + 1);
    }
  }
  const roots = new Set<number>();
  for (let i = 0; i < n; i++) roots.add(find(i));
  return roots.size;
}
