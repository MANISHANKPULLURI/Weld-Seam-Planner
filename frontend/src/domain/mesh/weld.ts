import type { Mesh } from "./primitives";

export function weldVertices(mesh: Mesh, eps = 1e-6): { positions: Float32Array; indices: Uint32Array; count: number } {
  const map = new Map<string, number>();
  const pos: number[] = [];
  const idx: number[] = [];
  function key(v: { x: number; y: number; z: number }) {
    return `${Math.round(v.x / eps)}|${Math.round(v.y / eps)}|${Math.round(v.z / eps)}`;
  }
  for (const t of mesh.triangles) {
    for (const v of [t.a, t.b, t.c]) {
      const k = key(v);
      let id = map.get(k);
      if (id === undefined) {
        id = pos.length / 3;
        map.set(k, id);
        pos.push(v.x, v.y, v.z);
      }
      idx.push(id);
    }
  }
  return { positions: new Float32Array(pos), indices: new Uint32Array(idx), count: mesh.triangles.length };
}
