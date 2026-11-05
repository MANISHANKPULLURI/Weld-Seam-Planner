/**
 * write mesh triangles to a binary stl buffer with computed normals
 */
export function writeBinaryStl(vertices: Float32Array, indices: Uint32Array, header = "Armatrix Weld Seam Planner repaired mesh"): ArrayBuffer {

  const triangles = indices.length / 3;
  const buffer = new ArrayBuffer(84 + triangles * 50);
  const view = new DataView(buffer);

  for (let i = 0; i < Math.min(header.length, 80); i++) view.setUint8(i, header.charCodeAt(i) & 0x7f);

  view.setUint32(80, triangles, true);

  let offset = 84;

  for (let t = 0; t < triangles; t++) {

    const a = indices[t * 3]! * 3, b = indices[t * 3 + 1]! * 3, c = indices[t * 3 + 2]! * 3;

    const ux = vertices[b]! - vertices[a]!, uy = vertices[b + 1]! - vertices[a + 1]!, uz = vertices[b + 2]! - vertices[a + 2]!;
    const vx = vertices[c]! - vertices[a]!, vy = vertices[c + 1]! - vertices[a + 1]!, vz = vertices[c + 2]! - vertices[a + 2]!;

    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz);
    if (len > 0) { nx /= len; ny /= len; nz /= len; }

    view.setFloat32(offset, nx, true); view.setFloat32(offset + 4, ny, true); view.setFloat32(offset + 8, nz, true);
    offset += 12;

    for (const v of [a, b, c]) {
      view.setFloat32(offset, vertices[v]!, true);
      view.setFloat32(offset + 4, vertices[v + 1]!, true);
      view.setFloat32(offset + 8, vertices[v + 2]!, true);
      offset += 12;
    }

    view.setUint16(offset, 0, true);
    offset += 2;
  }

  return buffer;
}
