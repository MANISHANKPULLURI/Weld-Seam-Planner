import { describe, expect, test } from "bun:test";
import { MeshError, parseStl } from "../src/index.ts";
import { OUTWARD_CUBE, asciiStl, binaryStl } from "./fixtures.ts";

const encode = (s: string) => new TextEncoder().encode(s).buffer as ArrayBuffer;

describe("parseStl", () => {

  test("reads a binary STL", () => {
    const parsed = parseStl(binaryStl(OUTWARD_CUBE));
    expect(parsed.format).toBe("binary");
    expect(parsed.triangleCount).toBe(12);
    expect(parsed.warnings).toEqual([]);
  });

  test("reads a binary STL whose header starts with 'solid'", () => {
    const buffer = binaryStl(OUTWARD_CUBE);
    new Uint8Array(buffer).set(new TextEncoder().encode("solid exported by SolidWorks"));
    const parsed = parseStl(buffer);
    expect(parsed.format).toBe("binary");
    expect(parsed.triangleCount).toBe(12);
  });

  test("ignores trailing bytes with a warning", () => {
    const stl = new Uint8Array(binaryStl(OUTWARD_CUBE));
    const padded = new Uint8Array(stl.length + 7);
    padded.set(stl);
    const parsed = parseStl(padded.buffer);
    expect(parsed.triangleCount).toBe(12);
    expect(parsed.warnings[0]).toContain("extra bytes");
  });

  test("reads what it can from a truncated binary file", () => {
    const stl = binaryStl(OUTWARD_CUBE);
    const parsed = parseStl(stl.slice(0, 84 + 50 * 8 + 20));
    expect(parsed.triangleCount).toBe(8);
    expect(parsed.warnings[0]).toContain("shorter");
  });

  test("refuses to recover a file that is mostly missing", () => {
    expect(() => parseStl(binaryStl(OUTWARD_CUBE).slice(0, 84 + 50 * 2))).toThrow(MeshError);
  });

  test("reads ASCII with odd case, tabs, CRLF and number formats", () => {
    const text = asciiStl(OUTWARD_CUBE).replace(/vertex/g, "VERTEX\t").replace(/\n/g, "\r\n").replace(/ 10 /g, " +1.0E+001 ");
    const parsed = parseStl(encode(text));
    expect(parsed.format).toBe("ascii");
    expect(parsed.triangleCount).toBe(12);
    expect(Math.max(...parsed.positions)).toBe(10);
  });

  test("counts multiple solids in one ASCII file", () => {
    const text = asciiStl(OUTWARD_CUBE.slice(0, 6), "a") + "\n" + asciiStl(OUTWARD_CUBE.slice(6), "b");
    expect(parseStl(encode(text)).solids).toBe(2);
  });

  test("rejects text that is not an STL", () => {
    expect(() => parseStl(encode("hello world, this is not a mesh at all. ".repeat(4)))).toThrow(MeshError);
  });

  test("rejects non-finite coordinates", () => {
    expect(() => parseStl(encode(asciiStl(OUTWARD_CUBE).replace("vertex 0 0 0", "vertex nan 0 0")))).toThrow("invalid coordinates");
  });

  test("enforces the triangle limit", () => {
    expect(() => parseStl(binaryStl(OUTWARD_CUBE), { maxTriangles: 5 })).toThrow("limit");
  });
});
