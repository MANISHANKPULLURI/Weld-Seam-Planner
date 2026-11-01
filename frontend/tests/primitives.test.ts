import { describe, expect, test } from "bun:test";
import { computeBounds } from "../src/domain/mesh/primitives.ts";

describe("computeBounds", () => {
  test("empty mesh returns zero bounds", () => {
    const b = computeBounds({ triangles: [] });
    expect(b.min).toEqual({ x:0,y:0,z:0 });
    expect(b.max).toEqual({ x:0,y:0,z:0 });
    expect(b.size).toEqual({ x:0,y:0,z:0 });
  });

  test("single point bounds", () => {
    const b = computeBounds({ triangles: [{ a:{x:5,y:6,z:7}, b:{x:5,y:6,z:7}, c:{x:5,y:6,z:7} }] });
    expect(b.min).toEqual({ x:5,y:6,z:7 });
    expect(b.size).toEqual({ x:0,y:0,z:0 });
  });

  test("correct min max size", () => {
    const b = computeBounds({ triangles: [{ a:{x:-1,y:-2,z:-3}, b:{x:4,y:5,z:6}, c:{x:0,y:0,z:0} }] });
    expect(b.min).toEqual({ x:-1,y:-2,z:-3 });
    expect(b.max).toEqual({ x:4,y:5,z:6 });
    expect(b.size).toEqual({ x:5,y:7,z:9 });
  });

  test("multiple triangles aggregate", () => {
    const b = computeBounds({ triangles: [
      { a:{x:0,y:0,z:0}, b:{x:1,y:0,z:0}, c:{x:0,y:1,z:0} },
      { a:{x:10,y:10,z:10}, b:{x:11,y:10,z:10}, c:{x:10,y:11,z:10} },
    ]});
    expect(b.min).toEqual({ x:0,y:0,z:0 });
    expect(b.max).toEqual({ x:11,y:11,z:10 });
  });

  test("negative coordinates handled", () => {
    const b = computeBounds({ triangles: [{ a:{x:-10,y:-10,z:-10}, b:{x:-5,y:-5,z:-5}, c:{x:-1,y:-1,z:-1} }] });
    expect(b.size.x).toBe(9);
  });
});
