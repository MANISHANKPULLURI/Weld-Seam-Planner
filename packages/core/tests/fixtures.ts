export type Tri = [[number, number, number], [number, number, number], [number, number, number]];


export const OUTWARD_CUBE: Tri[] = [
  [[0, 0, 0], [10, 10, 0], [10, 0, 0]],
  [[0, 0, 0], [0, 10, 0], [10, 10, 0]],
  [[0, 0, 0], [0, 10, 10], [0, 10, 0]],
  [[0, 0, 0], [0, 0, 10], [0, 10, 10]],
  [[0, 0, 10], [10, 10, 10], [0, 10, 10]],
  [[0, 0, 10], [10, 0, 10], [10, 10, 10]],
  [[10, 0, 0], [10, 10, 10], [10, 0, 10]],
  [[10, 0, 0], [10, 10, 0], [10, 10, 10]],
  [[0, 10, 0], [10, 10, 10], [10, 10, 0]],
  [[0, 10, 0], [0, 10, 10], [10, 10, 10]],
  [[0, 0, 0], [10, 0, 10], [0, 0, 10]],
  [[0, 0, 0], [10, 0, 0], [10, 0, 10]],
];


/**
 * reverse winding order of a triangle
 */
export function reversed(tri: Tri): Tri {
  return [tri[0], tri[2], tri[1]];
}


/**
 * build axis-aligned box triangles between two corners
 */
export function box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): Tri[] {
  return OUTWARD_CUBE.map((tri) => tri.map(([x, y, z]) => [
    x === 0 ? x0 : x1,
    y === 0 ? y0 : y1,
    z === 0 ? z0 : z1,
  ]) as Tri);
}



/**
 * extrude a 2d outline into a prism of given length
 */
export function prism(outline: [number, number][], length: number): Tri[] {
  const tris: Tri[] = [];
  for (const [i, j, k] of earClip(outline)) {
    const [a, b, c] = [outline[i]!, outline[j]!, outline[k]!];
    tris.push([[a[0], 0, a[1]], [b[0], 0, b[1]], [c[0], 0, c[1]]]);
    tris.push([[a[0], length, a[1]], [c[0], length, c[1]], [b[0], length, b[1]]]);
  }
  outline.forEach((p, i) => {
    const q = outline[(i + 1) % outline.length]!;
    tris.push([[p[0], 0, p[1]], [q[0], 0, q[1]], [q[0], length, q[1]]], [[p[0], 0, p[1]], [q[0], length, q[1]], [p[0], length, p[1]]]);
  });
  return tris;
}

/**
 * triangulate a polygon outline with ear clipping
 */
function earClip(poly: [number, number][]): [number, number, number][] {
  const idx = poly.map((_, i) => i);
  const area = poly.reduce((s, p, i) => s + p[0] * poly[(i + 1) % poly.length]![1] - poly[(i + 1) % poly.length]![0] * p[1], 0);
  if (area < 0) idx.reverse();
  const cross = (o: number[], a: number[], b: number[]) => (a[0]! - o[0]!) * (b[1]! - o[1]!) - (a[1]! - o[1]!) * (b[0]! - o[0]!);
  const out: [number, number, number][] = [];
  while (idx.length > 3) {
    let clipped = false;
    for (let n = 0; n < idx.length && !clipped; n++) {
      const i = idx[(n + idx.length - 1) % idx.length]!, j = idx[n]!, k = idx[(n + 1) % idx.length]!;
      const [a, b, c] = [poly[i]!, poly[j]!, poly[k]!];
      if (cross(a, b, c) <= 1e-12) continue;
      const inside = idx.some((m) => m !== i && m !== j && m !== k && cross(a, b, poly[m]!) >= 0 && cross(b, c, poly[m]!) >= 0 && cross(c, a, poly[m]!) >= 0);
      if (inside) continue;
      out.push([i, j, k]);
      idx.splice(n, 1);
      clipped = true;
    }
    if (!clipped) throw new Error("earClip: no ear found");
  }
  out.push([idx[0]!, idx[1]!, idx[2]!]);
  return out;
}


/**
 * serialize triangles to an ascii stl string
 */
export function asciiStl(tris: Tri[], name = "part"): string {
  const lines = [`solid ${name}`];
  for (const t of tris) {
    lines.push("  facet normal 0 0 0", "    outer loop");
    for (const p of t) lines.push(`      vertex ${p[0]} ${p[1]} ${p[2]}`);
    lines.push("    endloop", "  endfacet");
  }
  lines.push(`endsolid ${name}`);
  return lines.join("\n");
}


/**
 * build deduplicated vertices and uint32 indices from triangles
 */
export function indexed(tris: Tri[]) {
  const { vertices, indices } = indexedMesh(tris);
  return { vertices, indices: new Uint32Array(indices) };
}


/**
 * encode triangles into a binary stl buffer
 */
export function binaryStl(tris: Tri[]): ArrayBuffer {

  const buffer = new ArrayBuffer(84 + tris.length * 50);
  const view = new DataView(buffer);

  view.setUint32(80, tris.length, true);

  let offset = 84;

  for (const tri of tris) {

    offset += 12;

    for (const p of tri) {
      view.setFloat32(offset, p[0], true);
      view.setFloat32(offset + 4, p[1], true);
      view.setFloat32(offset + 8, p[2], true);
      offset += 12;
    }

    offset += 2;
  }

  return buffer;
}


/**
 * build shared vertices and integer indices from triangles
 */
export function indexedMesh(tris: Tri[]) {

  const vertices: number[] = [];
  const indices: number[] = [];
  const lookup = new Map<string, number>();

  for (const tri of tris) {
    for (const p of tri) {
      const key = p.join(",");
      let index = lookup.get(key);
      if (index === undefined) {
        index = vertices.length / 3;
        lookup.set(key, index);
        vertices.push(...p);
      }
      indices.push(index);
    }
  }

  return { vertices: new Float32Array(vertices), indices: new Int32Array(indices) };
}


/**
 * compute signed volume of an indexed triangle mesh
 */
export function signedVolume(vertices: Float32Array, indices: Int32Array) {

  let volume = 0;

  for (let i = 0; i < indices.length; i += 3) {

    const a = indices[i]! * 3, b = indices[i + 1]! * 3, c = indices[i + 2]! * 3;

    volume += vertices[a]! * (vertices[b + 1]! * vertices[c + 2]! - vertices[b + 2]! * vertices[c + 1]!)
      - vertices[a + 1]! * (vertices[b]! * vertices[c + 2]! - vertices[b + 2]! * vertices[c]!)
      + vertices[a + 2]! * (vertices[b]! * vertices[c + 1]! - vertices[b + 1]! * vertices[c]!);
  }

  return volume / 6;
}
