export function createSampleStl(): ArrayBuffer {
  const tris = [
    [[0, 0, 0], [10, 0, 0], [10, 10, 0]],
    [[0, 0, 0], [10, 10, 0], [0, 10, 0]],
    [[0, 0, 0], [0, 10, 0], [0, 10, 10]],
    [[0, 0, 0], [0, 10, 10], [0, 0, 10]],
    [[0, 0, 10], [0, 10, 10], [10, 10, 10]],
    [[0, 0, 10], [10, 10, 10], [10, 0, 10]],
    [[10, 0, 0], [10, 0, 10], [10, 10, 10]],
    [[10, 0, 0], [10, 10, 10], [10, 10, 0]],
    [[0, 10, 0], [10, 10, 0], [10, 10, 10]],
    [[0, 10, 0], [10, 10, 10], [0, 10, 10]],
    [[0, 0, 0], [0, 0, 10], [10, 0, 10]],
    [[0, 0, 0], [10, 0, 10], [10, 0, 0]],
  ] as const;
  const count = tris.length;
  const buf = new ArrayBuffer(84 + count * 50);
  const v = new DataView(buf);
  v.setUint32(80, count, true);
  let off = 84;
  for (const t of tris) {
    v.setFloat32(off, 0, true); v.setFloat32(off + 4, 0, true); v.setFloat32(off + 8, 1, true); off += 12;
    for (const p of t) { v.setFloat32(off, p[0], true); v.setFloat32(off + 4, p[1], true); v.setFloat32(off + 8, p[2], true); off += 12; }
    v.setUint16(off, 0, true); off += 2;
  }
  return buf;
}
