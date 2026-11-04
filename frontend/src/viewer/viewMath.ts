import * as THREE from "three";
import type { ViewId } from "../state/store";

export const ENGINEERING_STEPS = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000];

export function chooseEngineeringInterval(maxDim: number): number {
  if (maxDim <= 0 || !isFinite(maxDim)) return 10;
  const targetDivisions = 10;
  const raw = maxDim / targetDivisions;
  for (const s of ENGINEERING_STEPS) {
    if (s >= raw) return s;
  }
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / pow;
  let step = 1;
  if (norm <= 1) step = 1;
  else if (norm <= 2) step = 2;
  else if (norm <= 5) step = 5;
  else step = 10;
  return step * pow;
}

export function viewDirectionForId(id: ViewId): { dir: THREE.Vector3; up: THREE.Vector3 } {
  switch (id) {
    case "top": return { dir: new THREE.Vector3(0, 0, 1), up: new THREE.Vector3(0, 1, 0) };
    case "bottom": return { dir: new THREE.Vector3(0, 0, -1), up: new THREE.Vector3(0, 1, 0) };
    case "front": return { dir: new THREE.Vector3(0, -1, 0), up: new THREE.Vector3(0, 0, 1) };
    case "back": return { dir: new THREE.Vector3(0, 1, 0), up: new THREE.Vector3(0, 0, 1) };
    case "right": return { dir: new THREE.Vector3(1, 0, 0), up: new THREE.Vector3(0, 0, 1) };
    case "left": return { dir: new THREE.Vector3(-1, 0, 0), up: new THREE.Vector3(0, 0, 1) };
    case "iso":
    default: return { dir: new THREE.Vector3(0.7, -0.6, 0.7).normalize(), up: new THREE.Vector3(0, 0, 1) };
  }
}

export function computeFitDistance(
  bounds: { size: THREE.Vector3; sphereRadius: number },
  fovDeg: number,
  aspect: number,
  projection: "perspective" | "orthographic",
): number {
  const size = bounds.size;
  const radius = bounds.sphereRadius || size.length() / 2;
  const maxDim = Math.max(size.x, size.y, size.z);
  if (projection === "orthographic") return Math.max(radius * 1.5 + 20, 80);
  const fovRad = (fovDeg * Math.PI) / 180;
  const halfTan = Math.tan(fovRad / 2);
  let dist = radius / Math.sin(fovRad / 2);
  const distW = (size.x / 2) / (halfTan * aspect);
  const distH = (size.y / 2) / halfTan;
  const distD = (maxDim / 2) / halfTan;
  dist = Math.max(dist, distW, distH, distD) * 1.15;
  dist = Math.max(dist, radius * 1.4);
  return dist;
}

export function isZUpCorrect(scene: THREE.Scene, camera: THREE.Camera): boolean {
  return scene.up.equals(new THREE.Vector3(0, 0, 1)) && (camera as unknown as { up: THREE.Vector3 }).up.equals(new THREE.Vector3(0, 0, 1));
}
