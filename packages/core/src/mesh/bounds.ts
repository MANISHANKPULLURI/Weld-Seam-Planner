import type { Bounds } from "./types.ts";

export function computeBounds(xyz: Float32Array): Bounds {

  if (xyz.length === 0) {
    const zero = { x: 0, y: 0, z: 0 };
    return { min: zero, max: { ...zero }, size: { ...zero } };
  }

  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

  for (let i = 0; i < xyz.length; i += 3) {
    const x = xyz[i]!, y = xyz[i + 1]!, z = xyz[i + 2]!;
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
  }

  return {
    min: { x: minX, y: minY, z: minZ },
    max: { x: maxX, y: maxY, z: maxZ },
    size: { x: maxX - minX, y: maxY - minY, z: maxZ - minZ },
  };
}

export function diagonalOf(xyz: Float32Array): number {
  const { size } = computeBounds(xyz);
  return Math.hypot(size.x, size.y, size.z);
}
