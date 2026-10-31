export type Vec3 = { x: number; y: number; z: number };
export type Triangle = { a: Vec3; b: Vec3; c: Vec3 };
export type Mesh = { triangles: Triangle[] };
export type Bounds = { min: Vec3; max: Vec3; size: Vec3 };

export function computeBounds(mesh: Mesh): Bounds {
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (const t of mesh.triangles) {
    for (const v of [t.a, t.b, t.c]) {
      if (v.x < minX) minX = v.x;
      if (v.y < minY) minY = v.y;
      if (v.z < minZ) minZ = v.z;
      if (v.x > maxX) maxX = v.x;
      if (v.y > maxY) maxY = v.y;
      if (v.z > maxZ) maxZ = v.z;
    }
  }
  if (!isFinite(minX)) return { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 }, size: { x: 0, y: 0, z: 0 } };
  return { min: { x: minX, y: minY, z: minZ }, max: { x: maxX, y: maxY, z: maxZ }, size: { x: maxX - minX, y: maxY - minY, z: maxZ - minZ } };
}
