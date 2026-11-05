import type { MeshData, Store } from "../state/store";

type Box = { min: [number, number, number]; max: [number, number, number] };

let cache: { mesh: MeshData; vertexBody: Int32Array } | null = null;

/**
 * map every vertex to its body, caching the result per mesh
 */
function vertexBodies(mesh: MeshData): Int32Array {
  if (cache?.mesh === mesh) return cache.vertexBody;
  const vertexBody = new Int32Array(mesh.positions.length / 3).fill(-1);
  for (let f = 0; f < mesh.bodyOfTriangle.length; f++) {
    for (let k = 0; k < 3; k++) vertexBody[mesh.orientedIndices[f * 3 + k]!] = mesh.bodyOfTriangle[f]!;
  }
  cache = { mesh, vertexBody };
  return vertexBody;
}

/**
 * measure the bounding box of the given bodies
 */
function boxOf(mesh: MeshData, bodies: Set<number>): Box {
  const vb = vertexBodies(mesh), p = mesh.positions;
  const min: [number, number, number] = [Infinity, Infinity, Infinity], max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let v = 0; v < vb.length; v++) {
    if (!bodies.has(vb[v]!)) continue;
    for (let k = 0; k < 3; k++) { const x = p[v * 3 + k]!; if (x < min[k]!) min[k] = x; if (x > max[k]!) max[k] = x; }
  }
  return { min, max };
}


/**
 * frame the bodies a seam touches, or the seam itself
 */
export function focusForSeam(mesh: MeshData, seam: { name: string; points: Float32Array }): NonNullable<Store["focus"]> {
  const vb = vertexBodies(mesh), p = mesh.positions, s = seam.points;
  const b = mesh.health.bounds.size;
  const diag = Math.hypot(b.x, b.y, b.z);
  const tol = diag * 0.004;
  const n = s.length / 3, step = Math.max(1, Math.floor(n / 40));
  const bodies = new Set<number>();
  for (let i = 0; i < n; i += step) {
    for (let v = 0; v < vb.length; v++) {
      if (bodies.has(vb[v]!)) continue;
      if (Math.abs(p[v * 3]! - s[i * 3]!) < tol && Math.abs(p[v * 3 + 1]! - s[i * 3 + 1]!) < tol && Math.abs(p[v * 3 + 2]! - s[i * 3 + 2]!) < tol) bodies.add(vb[v]!);
    }
  }
  const all = mesh.health.bodies;
  if (bodies.size === 0 || bodies.size >= all) {
    const min: [number, number, number] = [Infinity, Infinity, Infinity], max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) { const x = s[i * 3 + k]!; if (x < min[k]!) min[k] = x; if (x > max[k]!) max[k] = x; }
    const pad = Math.max(diag * 0.06, Math.max(...max.map((x, k) => x - min[k]!)) * 0.3);
    return { bodies: [], label: seam.name, box: { min: min.map((x) => x - pad) as Box["min"], max: max.map((x) => x + pad) as Box["max"] } };
  }
  return { bodies: [...bodies], label: seam.name, box: boxOf(mesh, bodies) };
}

/**
 * frame a single body for the camera
 */
export function focusForBody(mesh: MeshData, body: number): NonNullable<Store["focus"]> {
  return { bodies: [body], label: `Part ${body + 1}`, box: boxOf(mesh, new Set([body])) };
}
