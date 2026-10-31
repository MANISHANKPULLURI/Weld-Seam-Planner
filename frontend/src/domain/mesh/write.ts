import type { Mesh } from "./primitives";

export function writeBinaryStl(mesh: Mesh): ArrayBuffer {
  const count = mesh.triangles.length;
  const buf = new ArrayBuffer(84 + count * 50);
  const view = new DataView(buf);
  view.setUint32(80, count, true);
  let off = 84;
  for (const t of mesh.triangles) {
    view.setFloat32(off, 0, true); view.setFloat32(off + 4, 0, true); view.setFloat32(off + 8, 1, true); off += 12;
    for (const v of [t.a, t.b, t.c]) { view.setFloat32(off, v.x, true); view.setFloat32(off + 4, v.y, true); view.setFloat32(off + 8, v.z, true); off += 12; }
    view.setUint16(off, 0, true); off += 2;
  }
  return buf;
}
