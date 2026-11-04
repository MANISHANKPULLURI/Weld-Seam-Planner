import { describe, expect, test } from "bun:test";
import { formatCount, formatSize, hasIssues, healthChecks } from "../src/domain/mesh/describe";

const size = (x: number, y: number, z: number) => ({ x, y, z });

describe("health summary", () => {
  const base = { triangles: 12, bodies: 1, openEdges: 0, nonManifold: 0, flippedFaces: 0, degenerateRemoved: 0, duplicateRemoved: 0, isManifoldSolid: true, bounds: { min: size(0, 0, 0), max: size(1, 1, 1), size: size(1, 1, 1) } };

  test("clean part has no issues and every check passes", () => {
    expect(hasIssues(base)).toBe(false);
    expect(healthChecks(base).every((c) => c.ok)).toBe(true);
  });

  test("several bodies are information, not a problem", () => {
    const h = { ...base, bodies: 4 };
    expect(hasIssues(h)).toBe(false);
    expect(healthChecks(h).find((c) => c.id === "bodies")!.level).toBe("info");
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
