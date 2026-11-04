import { describe, expect, test } from "bun:test";
import { guessUnits } from "../src/domain/mesh/units";
import { formatCount, formatSize, hasIssues, healthChecks } from "../src/domain/mesh/describe";

const size = (x: number, y: number, z: number) => ({ x, y, z });

describe("guessUnits", () => {
  test("typical weldment in millimetres stays mm without a note", () => {
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
    const g = guessUnits(size(50000, 100, 100), "x.stl");
    expect(g.units).toBe("mm");
    expect(g.note).not.toBeNull();
  });

  test("degenerate sizes fall back to mm", () => {
    expect(guessUnits(size(0, 0, 0), null)).toEqual({ units: "mm", note: null });
  });
});

describe("health summary", () => {
  const base = { triangles: 12, bodies: 1, openEdges: 0, nonManifold: 0, flippedFaces: 0, bounds: { min: size(0, 0, 0), max: size(1, 1, 1), size: size(1, 1, 1) } };

  test("clean part has no issues and every check passes", () => {
    expect(hasIssues(base)).toBe(false);
    expect(healthChecks(base).every((c) => c.ok)).toBe(true);
  });

  test("flipped faces fail their check", () => {
    const h = { ...base, flippedFaces: 3 };
    expect(hasIssues(h)).toBe(true);
    const flipped = healthChecks(h).find((c) => c.id === "flippedFaces")!;
    expect(flipped.ok).toBe(false);
    expect(flipped.value).toBe(3);
  });

  test("copy never uses em dashes", () => {
    const h = { ...base, openEdges: 1, nonManifold: 1, bodies: 2, flippedFaces: 1 };
    for (const c of healthChecks(h)) expect(c.hint).not.toMatch(/[—–]|--/);
  });

  test("numbers are formatted for reading", () => {
    expect(formatCount(139283)).toBe("139,283");
    expect(formatSize(size(711.93, 224.89, 260.56))).toBe("711.9 × 224.9 × 260.6");
    expect(formatSize(size(10, 5, 2))).toBe("10.00 × 5.00 × 2.00");
  });
});
