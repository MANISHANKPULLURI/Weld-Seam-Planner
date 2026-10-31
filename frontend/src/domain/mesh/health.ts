import type { Mesh, Bounds } from "./primitives";
import { computeBounds } from "./primitives";

export type Health = {
  triangles: number;
  bodies: number;
  openEdges: number;
  bounds: Bounds;
  hasFlippedFaces: boolean;
};

export function checkHealth(mesh: Mesh): Health {
  const bounds = computeBounds(mesh);
  const edgeCount = new Map<string, number>();
  function edgeKey(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) {
    const k1 = `${a.x},${a.y},${a.z}|${b.x},${b.y},${b.z}`;
    const k2 = `${b.x},${b.y},${b.z}|${a.x},${a.y},${a.z}`;
    return k1 < k2 ? k1 : k2;
  }
  for (const t of mesh.triangles) {
    for (const [p, q] of [[t.a, t.b], [t.b, t.c], [t.c, t.a]] as const) {
      const k = edgeKey(p, q);
      edgeCount.set(k, (edgeCount.get(k) ?? 0) + 1);
    }
  }
  let openEdges = 0;
  for (const c of edgeCount.values()) if (c === 1) openEdges++;
  const bodies = estimateBodies(mesh);
  return { triangles: mesh.triangles.length, bodies, openEdges, bounds, hasFlippedFaces: false };
}

function estimateBodies(mesh: Mesh): number {
  if (mesh.triangles.length === 0) return 0;
  const n = mesh.triangles.length;
  const parent = Array.from({ length: n }, (_, i) => i);
  function find(x: number): number { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; }
  function union(a: number, b: number) { a = find(a); b = find(b); if (a !== b) parent[a] = b; }
  const vmap = new Map<string, number[]>();
  function vkey(v: { x: number; y: number; z: number }) { return `${v.x}|${v.y}|${v.z}`; }
  mesh.triangles.forEach((t, i) => {
    for (const v of [t.a, t.b, t.c]) {
      const k = vkey(v);
      const arr = vmap.get(k);
      if (arr) { for (const j of arr) union(i, j); arr.push(i); } else vmap.set(k, [i]);
    }
  });
  const roots = new Set<number>();
  for (let i = 0; i < n; i++) roots.add(find(i));
  return roots.size;
}
