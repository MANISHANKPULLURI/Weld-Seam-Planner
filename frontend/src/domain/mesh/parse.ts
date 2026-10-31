import type { Mesh, Triangle } from "./primitives";

export function parseStl(buffer: ArrayBuffer): Mesh {
  const bytes = new Uint8Array(buffer);
  if (bytes.length === 0) throw new Error("No triangles found. This doesn't look like an STL file.");
  const text = new TextDecoder().decode(bytes.slice(0, 512));
  if (text.trimStart().startsWith("solid")) {
    try {
      const ascii = new TextDecoder().decode(bytes);
      if (ascii.includes("facet normal")) return parseAscii(ascii);
    } catch {}
  }
  return parseBinary(buffer);
}

function parseAscii(text: string): Mesh {
  const re = /vertex\s+([^\s]+)\s+([^\s]+)\s+([^\s]+)/g;
  const verts: { x: number; y: number; z: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const x = Number(m[1]), y = Number(m[2]), z = Number(m[3]);
    if (!isFinite(x) || !isFinite(y) || !isFinite(z)) throw new Error("The file contains invalid coordinates.");
    verts.push({ x, y, z });
  }
  if (verts.length % 3 !== 0 || verts.length === 0) throw new Error("No triangles found. This doesn't look like an STL file.");
  const triangles: Triangle[] = [];
  for (let i = 0; i < verts.length; i += 3) triangles.push({ a: verts[i], b: verts[i + 1], c: verts[i + 2] });
  return { triangles };
}

function parseBinary(buffer: ArrayBuffer): Mesh {
  if (buffer.byteLength < 84) throw new Error("This file doesn't look like a valid STL.");
  const view = new DataView(buffer);
  const count = view.getUint32(80, true);
  if (count === 0) throw new Error("No triangles found. This doesn't look like an STL file.");
  if (buffer.byteLength < 84 + count * 50) throw new Error("This file doesn't look like a valid STL.");
  const triangles: Triangle[] = [];
  let off = 84;
  for (let i = 0; i < count; i++) {
    view.getFloat32(off, true); view.getFloat32(off + 4, true); view.getFloat32(off + 8, true);
    off += 12;
    const a = { x: view.getFloat32(off, true), y: view.getFloat32(off + 4, true), z: view.getFloat32(off + 8, true) }; off += 12;
    const b = { x: view.getFloat32(off, true), y: view.getFloat32(off + 4, true), z: view.getFloat32(off + 8, true) }; off += 12;
    const c = { x: view.getFloat32(off, true), y: view.getFloat32(off + 4, true), z: view.getFloat32(off + 8, true) }; off += 12;
    off += 2;
    for (const v of [a, b, c]) if (!isFinite(v.x) || !isFinite(v.y) || !isFinite(v.z)) throw new Error("The file contains invalid coordinates.");
    triangles.push({ a, b, c });
  }
  return { triangles };
}
