import { describe, expect, test } from "bun:test";
import { EXAMPLE_PROCEDURES, arcEnergyKjMm, arcTimeS, filletSizes, procedureSchema, weldPosition, weldedLengthMm } from "../src/index.ts";

describe("weld calculations", () => {

  test("arc energy follows EN 1011-1: U·I·60 / (1000·v)", () => {
    expect(arcEnergyKjMm(22, 200, 400)).toBeCloseTo(0.66, 6);
    expect(arcEnergyKjMm(22, 200, 0)).toBe(0);
  });

  test("arc time covers passes and only the welded part of stitches", () => {
    expect(arcTimeS(200, 400)).toBeCloseTo(30, 6);
    expect(arcTimeS(200, 400, 2)).toBeCloseTo(60, 6);
    
    expect(weldedLengthMm(400, { weld_length_mm: 50, pitch_mm: 150 })).toBe(150);
    expect(weldedLengthMm(30, { weld_length_mm: 50, pitch_mm: 150 })).toBe(30);
  });

  test("fillet throat and leg convert by √2 at 90°", () => {
    expect(filletSizes({ basis: "z", value_mm: 5 }).a).toBeCloseTo(3.536, 3);
    expect(filletSizes({ basis: "a", value_mm: 4 }).z).toBeCloseTo(5.657, 3);
  });

  test("weld positions from axis and face direction", () => {
    const up: [number, number, number] = [0, 0, 1], side: [number, number, number] = [1, 0, 0], down: [number, number, number] = [0, 0, -1];
    const along: [number, number, number] = [0, 1, 0];
    expect(weldPosition(along, up, side, "fillet").iso).toBe("PB");
    expect(weldPosition(along, [Math.SQRT1_2, 0, Math.SQRT1_2], [-Math.SQRT1_2, 0, Math.SQRT1_2], "fillet").iso).toBe("PA");
    expect(weldPosition(along, down, side, "fillet")).toEqual({ iso: "PD", aws: "4F" });
    expect(weldPosition([0, 0, 1], side, [0, 1, 0], "fillet")).toEqual({ iso: "PF", aws: "3F" });
    expect(weldPosition([0, 0.1, -1], side, [0, 1, 0], "fillet").iso).toBe("PG");
    expect(weldPosition(along, side, side, "butt").iso).toBe("PC");
  });

  test("example procedures are valid against the schema", () => {
    for (const p of EXAMPLE_PROCEDURES) expect(procedureSchema.safeParse(p).success).toBe(true);
  });
});
