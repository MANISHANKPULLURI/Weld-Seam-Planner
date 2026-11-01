import { describe, expect, test } from "bun:test";
import { parseStl } from "../src/domain/mesh/parse.ts";

function asciiStl(triangles: string): ArrayBuffer {
  return new TextEncoder().encode(triangles).buffer;
}

function binaryStl(triangles: { a: number[]; b: number[]; c: number[] }[]): ArrayBuffer {
  const buf = new ArrayBuffer(84 + triangles.length * 50);
  const v = new DataView(buf);
  v.setUint32(80, triangles.length, true);
  let off = 84;
  for (const t of triangles) {
    v.setFloat32(off, 0, true); v.setFloat32(off+4, 0, true); v.setFloat32(off+8, 1, true); off+=12;
    for (const p of [t.a, t.b, t.c]) { v.setFloat32(off, p[0], true); v.setFloat32(off+4, p[1], true); v.setFloat32(off+8, p[2], true); off+=12; }
    v.setUint16(off, 0, true); off+=2;
  }
  return buf;
}

describe("parseStl", () => {
  test("rejects empty buffer", () => {
    expect(() => parseStl(new ArrayBuffer(0))).toThrow(/No triangles|valid STL/i);
  });

  test("rejects truncated binary header", () => {
    expect(() => parseStl(new ArrayBuffer(10))).toThrow(/valid STL/i);
  });

  test("rejects zero triangles binary", () => {
    const buf = new ArrayBuffer(84);
    new DataView(buf).setUint32(80, 0, true);
    expect(() => parseStl(buf)).toThrow(/No triangles/i);
  });

  test("rejects incomplete triangle data", () => {
    const buf = new ArrayBuffer(84);
    new DataView(buf).setUint32(80, 1, true);
    expect(() => parseStl(buf)).toThrow(/valid STL/i);
  });

  test("parses valid ascii single triangle", () => {
    const stl = `solid test
  facet normal 0 0 1
    outer loop
      vertex 0 0 0
      vertex 1 0 0
      vertex 0 1 0
    endloop
  endfacet
endsolid`;
    const mesh = parseStl(asciiStl(stl));
    expect(mesh.triangles.length).toBe(1);
    expect(mesh.triangles[0].a).toEqual({ x: 0, y: 0, z: 0 });
  });

  test("parses valid binary single triangle", () => {
    const mesh = parseStl(binaryStl([{ a: [0,0,0], b: [1,0,0], c: [0,1,0] }]));
    expect(mesh.triangles.length).toBe(1);
  });

  test("parses ascii with scientific notation", () => {
    const stl = `solid test
  facet normal 0 0 1
    outer loop
      vertex 1e-5 2.5e+3 -3.14
      vertex 0 0 0
      vertex 0 1 0
    endloop
  endfacet
endsolid`;
    const mesh = parseStl(asciiStl(stl));
    expect(mesh.triangles[0].a.x).toBeCloseTo(1e-5);
    expect(mesh.triangles[0].a.y).toBeCloseTo(2500);
  });

  test("rejects invalid coordinates", () => {
    const stl = `solid test
  facet normal 0 0 1
    outer loop
      vertex NaN 0 0
      vertex 0 0 0
      vertex 0 1 0
    endloop
  endfacet
endsolid`;
    expect(() => parseStl(asciiStl(stl))).toThrow(/invalid coordinates/i);
  });

  test("rejects non-stl garbage", () => {
    expect(() => parseStl(asciiStl("hello world not stl"))).toThrow(/valid STL|No triangles/i);
  });

  test("binary starting with solid is not misdetected as ascii", () => {
    const buf = binaryStl([{ a: [0,0,0], b: [1,0,0], c: [0,1,0] }]);
    new Uint8Array(buf).set(new TextEncoder().encode("solid"), 0);
    const mesh = parseStl(buf);
    expect(mesh.triangles.length).toBe(1);
  });

  test("parses multiple triangles", () => {
    const stl = `solid test
  facet normal 0 0 1
    outer loop
      vertex 0 0 0
      vertex 1 0 0
      vertex 0 1 0
    endloop
  endfacet
  facet normal 0 0 1
    outer loop
      vertex 1 0 0
      vertex 1 1 0
      vertex 0 1 0
    endloop
  endfacet
endsolid`;
    expect(parseStl(asciiStl(stl)).triangles.length).toBe(2);
  });
});
