type P = readonly [number, number, number];

const CUBE: readonly (readonly [P, P, P])[] = [
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

export function createSampleStl(): ArrayBuffer {
  const count = CUBE.length;
  const buf = new ArrayBuffer(84 + count * 50);
  const v = new DataView(buf);
  v.setUint32(80, count, true);
  let off = 84;
  for (const [a, b, c] of CUBE) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const wx = c[0] - a[0], wy = c[1] - a[1], wz = c[2] - a[2];
    const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
    const len = Math.hypot(nx, ny, nz) || 1;
    v.setFloat32(off, nx / len, true); v.setFloat32(off + 4, ny / len, true); v.setFloat32(off + 8, nz / len, true); off += 12;
    for (const p of [a, b, c]) { v.setFloat32(off, p[0], true); v.setFloat32(off + 4, p[1], true); v.setFloat32(off + 8, p[2], true); off += 12; }
    v.setUint16(off, 0, true); off += 2;
  }
  return buf;
}
