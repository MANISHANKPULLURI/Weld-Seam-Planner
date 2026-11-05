import { describe, expect, test } from "bun:test";
import { guessUnits, guessUpAxis, partSizeMm } from "../src/index.ts";

/**
 * make a vec3-like size object for unit tests
 */
const size = (x: number, y: number, z: number) => ({ x, y, z });

describe("guessUnits", () => {
  test("typical weldments stay mm without a note", () => {
    expect(guessUnits(size(300, 200, 150), "bracket.stl")).toEqual({ units: "mm", note: null });
    expect(guessUnits(size(2500, 800, 600), "frame.stl")).toEqual({ units: "mm", note: null });
  });

  test("sub-2 largest dimension suggests metres", () => {
    expect(guessUnits(size(1.2, 0.4, 0.3), "tank.stl").units).toBe("m");
  });

  test("small parts stay mm but mention inches", () => {
    const g = guessUnits(size(12, 4, 2), "plate.stl");
    expect(g.units).toBe("mm");
    expect(g.note).toContain("inch");
  });

  test("file name hints switch to inch", () => {
    expect(guessUnits(size(300, 200, 100), "bracket_in.stl").units).toBe("inch");
    expect(guessUnits(size(300, 200, 100), "Frame INCH rev2.stl").units).toBe("inch");
    expect(guessUnits(size(300, 200, 100), "inner_pin.stl").units).toBe("mm");
  });

  test("very large values warn", () => {
    expect(guessUnits(size(50000, 100, 100), "x.stl").note).not.toBeNull();
  });

  test("degenerate sizes fall back to mm", () => {
    expect(guessUnits(size(0, 0, 0), null)).toEqual({ units: "mm", note: null });
  });
});

describe("frame helpers", () => {
  test("up axis always guesses +Z, including flat plates and long beams", () => {
    expect(guessUpAxis(size(400, 200, 70))).toBe("+z");
    expect(guessUpAxis(size(100, 2000, 100))).toBe("+z");
  });

  test("size converts to mm and swaps Y and Z for +Y up", () => {
    expect(partSizeMm(size(1, 2, 3), "inch", "+z")).toEqual({ x: 25.4, y: 50.8, z: 76.19999999999999 });
    expect(partSizeMm(size(10, 20, 30), "mm", "+y")).toEqual({ x: 10, y: 30, z: 20 });
  });
});
