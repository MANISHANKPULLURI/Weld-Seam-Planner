import { describe, expect, test } from "bun:test";
import { weldVertices } from "../src/domain/mesh/weld.ts";
import type { Mesh } from "../src/domain/mesh/primitives.ts";

describe("weldVertices", () => {
  test("deduplicates shared vertices", () => {
    const mesh: Mesh = {
      triangles: [
        { a: {x:0,y:0,z:0}, b:{x:1,y:0,z:0}, c:{x:0,y:1,z:0} },
        { a: {x:1,y:0,z:0}, b:{x:1,y:1,z:0}, c:{x:0,y:1,z:0} },
      ]
    };
    const { positions, indices, count } = weldVertices(mesh);
    expect(count).toBe(2);
    expect(positions.length).toBe(12);
    expect(indices.length).toBe(6);
  });

  test("single triangle creates 3 unique vertices", () => {
    const mesh: Mesh = { triangles: [{ a:{x:0,y:0,z:0}, b:{x:1,y:0,z:0}, c:{x:0,y:1,z:0} }] };
    const { positions, indices } = weldVertices(mesh);
    expect(positions.length).toBe(9);
    expect(new Set(indices).size).toBe(3);
  });

  test("tolerance merges near vertices", () => {
    const mesh: Mesh = {
      triangles: [
        { a:{x:0,y:0,z:0}, b:{x:1,y:0,z:0}, c:{x:0,y:1,z:0} },
        { a:{x:0.0000001,y:0,z:0}, b:{x:1,y:0,z:0}, c:{x:0,y:1,z:0} },
      ]
    };
    const w1 = weldVertices(mesh, 1e-6);
    expect(w1.positions.length).toBe(9);
    const w2 = weldVertices(mesh, 1e-9);
    expect(w2.positions.length).toBe(12);
  });

  test("empty mesh returns empty arrays", () => {
    const { positions, indices, count } = weldVertices({ triangles: [] });
    expect(count).toBe(0);
    expect(positions.length).toBe(0);
    expect(indices.length).toBe(0);
  });

  test("preserves count", () => {
    const mesh: Mesh = { triangles: Array.from({length:5}, () => ({ a:{x:0,y:0,z:0}, b:{x:1,y:0,z:0}, c:{x:0,y:1,z:0} })) };
    expect(weldVertices(mesh).count).toBe(5);
  });

  test("indices reference valid positions", () => {
    const mesh: Mesh = { triangles: [{ a:{x:0,y:0,z:0}, b:{x:1,y:0,z:0}, c:{x:0,y:1,z:0} }] };
    const { positions, indices } = weldVertices(mesh);
    const maxIdx = positions.length/3 -1;
    for (const i of indices) expect(i).toBeLessThanOrEqual(maxIdx);
  });
});
