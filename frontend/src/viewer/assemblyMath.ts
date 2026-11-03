import type { ComponentTransform, Vec3 } from "../state/store";

export function degToRad(d: number): number { return (d * Math.PI) / 180; }
export function radToDeg(r: number): number { return (r * 180) / Math.PI; }

export function cloneVec3(v: Vec3): Vec3 { return { x: v.x, y: v.y, z: v.z }; }

export function defaultTransform(): ComponentTransform {
  return { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 } };
}

export function serializeTransform(t: ComponentTransform): string {
  return JSON.stringify(t);
}
export function deserializeTransform(s: string): ComponentTransform {
  const p = JSON.parse(s) as ComponentTransform;
  return {
    position: { x: Number(p.position.x) || 0, y: Number(p.position.y) || 0, z: Number(p.position.z) || 0 },
    rotation: { x: Number(p.rotation.x) || 0, y: Number(p.rotation.y) || 0, z: Number(p.rotation.z) || 0 },
  };
}

export function applyTransformToBounds(
  bounds: { min: Vec3; max: Vec3; size: Vec3 },
  transform: ComponentTransform
): { min: Vec3; max: Vec3; size: Vec3; center: Vec3 } {
  const corners: Vec3[] = [
    { x: bounds.min.x, y: bounds.min.y, z: bounds.min.z },
    { x: bounds.min.x, y: bounds.min.y, z: bounds.max.z },
    { x: bounds.min.x, y: bounds.max.y, z: bounds.min.z },
    { x: bounds.min.x, y: bounds.max.y, z: bounds.max.z },
    { x: bounds.max.x, y: bounds.min.y, z: bounds.min.z },
    { x: bounds.max.x, y: bounds.min.y, z: bounds.max.z },
    { x: bounds.max.x, y: bounds.max.y, z: bounds.min.z },
    { x: bounds.max.x, y: bounds.max.y, z: bounds.max.z },
  ];
  const rx = degToRad(transform.rotation.x);
  const ry = degToRad(transform.rotation.y);
  const rz = degToRad(transform.rotation.z);
  const cx = Math.cos(rx), sx = Math.sin(rx);
  const cy = Math.cos(ry), sy = Math.sin(ry);
  const cz = Math.cos(rz), sz = Math.sin(rz);
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (const c of corners) {
    let x = c.x, y = c.y, z = c.z;
    let nx = x * cz - y * sz;
    let ny = x * sz + y * cz;
    x = nx; y = ny;
    nx = x * cy + z * sy;
    let nz = -x * sy + z * cy;
    x = nx; z = nz;
    ny = y * cx - z * sx;
    nz = y * sx + z * cx;
    y = ny; z = nz;
    x += transform.position.x;
    y += transform.position.y;
    z += transform.position.z;
    minX = Math.min(minX, x); minY = Math.min(minY, y); minZ = Math.min(minZ, z);
    maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); maxZ = Math.max(maxZ, z);
  }
  return {
    min: { x: minX, y: minY, z: minZ },
    max: { x: maxX, y: maxY, z: maxZ },
    size: { x: maxX - minX, y: maxY - minY, z: maxZ - minZ },
    center: { x: (minX + maxX) / 2, y: (minY + maxY) / 2, z: (minZ + maxZ) / 2 },
  };
}

export function computeAssemblyBounds(
  components: Array<{ bounds: { min: Vec3; max: Vec3; size: Vec3 }; transform: ComponentTransform; visible: boolean }>
): { min: Vec3; max: Vec3; size: Vec3; center: Vec3 } | null {
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  let has = false;
  for (const c of components) {
    if (!c.visible) continue;
    const wb = applyTransformToBounds(c.bounds, c.transform);
    minX = Math.min(minX, wb.min.x); minY = Math.min(minY, wb.min.y); minZ = Math.min(minZ, wb.min.z);
    maxX = Math.max(maxX, wb.max.x); maxY = Math.max(maxY, wb.max.y); maxZ = Math.max(maxZ, wb.max.z);
    has = true;
  }
  if (!has) return null;
  return {
    min: { x: minX, y: minY, z: minZ },
    max: { x: maxX, y: maxY, z: maxZ },
    size: { x: maxX - minX, y: maxY - minY, z: maxZ - minZ },
    center: { x: (minX + maxX) / 2, y: (minY + maxY) / 2, z: (minZ + maxZ) / 2 },
  };
}

export function explodedOffset(center: Vec3, assemblyCenter: Vec3, factor: number): Vec3 {
  if (factor === 0) return { x: 0, y: 0, z: 0 };
  const dx = center.x - assemblyCenter.x;
  const dy = center.y - assemblyCenter.y;
  const dz = center.z - assemblyCenter.z;
  const len = Math.hypot(dx, dy, dz) || 1;
  const scale = factor * len * 0.6;
  return { x: (dx / len) * scale, y: (dy / len) * scale, z: (dz / len) * scale };
}

export function distanceBetween(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}
