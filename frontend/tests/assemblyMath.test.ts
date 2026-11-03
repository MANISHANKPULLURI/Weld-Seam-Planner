import { describe, it, expect } from "bun:test";
import { degToRad, radToDeg, serializeTransform, deserializeTransform, applyTransformToBounds, computeAssemblyBounds, explodedOffset, distanceBetween } from "../src/viewer/assemblyMath";

describe("assemblyMath", () => {
  it("deg/rad conversion", () => {
    expect(degToRad(180)).toBeCloseTo(Math.PI);
    expect(radToDeg(Math.PI)).toBeCloseTo(180);
  });
  it("serialize roundtrip", () => {
    const t = { position: { x: 10, y: -5, z: 3 }, rotation: { x: 90, y: 0, z: 45 } };
    const s = serializeTransform(t);
    const d = deserializeTransform(s);
    expect(d.position.x).toBe(10);
    expect(d.rotation.x).toBe(90);
  });
  it("applyTransformToBounds translation", () => {
    const b = { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 10, z: 10 }, size: { x: 10, y: 10, z: 10 } };
    const t = { position: { x: 5, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 } };
    const wb = applyTransformToBounds(b, t);
    expect(wb.min.x).toBeCloseTo(5);
    expect(wb.max.x).toBeCloseTo(15);
    expect(wb.center.x).toBeCloseTo(10);
  });
  it("applyTransformToBounds rotation 90 around Z", () => {
    const b = { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 0, z: 0 }, size: { x: 10, y: 0, z: 0 } };
    const t = { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 90 } };
    const wb = applyTransformToBounds(b, t);
    expect(wb.min.x).toBeCloseTo(0, 1);
    expect(wb.max.y).toBeCloseTo(10, 1);
  });
  it("computeAssemblyBounds", () => {
    const comps = [
      { bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 10, z: 10 }, size: { x: 10, y: 10, z: 10 } }, transform: { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 } }, visible: true },
      { bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 5, y: 5, z: 5 }, size: { x: 5, y: 5, z: 5 } }, transform: { position: { x: 20, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 } }, visible: true },
    ];
    const ab = computeAssemblyBounds(comps)!;
    expect(ab.min.x).toBeCloseTo(0);
    expect(ab.max.x).toBeCloseTo(25);
  });
  it("computeAssemblyBounds respects visibility", () => {
    const comps = [
      { bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 10, z: 10 }, size: { x: 10, y: 10, z: 10 } }, transform: { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 } }, visible: false },
    ];
    expect(computeAssemblyBounds(comps)).toBeNull();
  });
  it("explodedOffset", () => {
    const off0 = explodedOffset({ x: 10, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, 0);
    expect(off0.x).toBe(0);
    const off = explodedOffset({ x: 10, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, 1);
    expect(off.x).toBeGreaterThan(0);
  });
  it("distanceBetween", () => {
    expect(distanceBetween({ x: 0, y: 0, z: 0 }, { x: 3, y: 4, z: 0 })).toBe(5);
  });
});
