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


export function reversed(tri: Tri): Tri {
  return [tri[0], tri[2], tri[1]];
}


export function box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): Tri[] {
  return OUTWARD_CUBE.map((tri) => tri.map(([x, y, z]) => [
    x === 0 ? x0 : x1,
    y === 0 ? y0 : y1,
    z === 0 ? z0 : z1,
  ]) as Tri);
}


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


export function indexed(tris: Tri[]) {
  const { vertices, indices } = indexedMesh(tris);
  return { vertices, indices: new Uint32Array(indices) };
}


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
