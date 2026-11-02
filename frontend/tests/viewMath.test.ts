import { describe, expect, test } from "bun:test";
import * as THREE from "three";
import { chooseEngineeringInterval, viewDirectionForId, computeFitDistance, computeDisplayScale, displayToOriginal, originalToDisplay } from "../src/viewer/viewMath.ts";

describe("chooseEngineeringInterval", () => {
  test("small model ~1 => interval 0.2 or 0.1/0.5", () => {
    const i = chooseEngineeringInterval(1.2);
    expect([0.1,0.2,0.5,1].includes(i)).toBe(true);
  });
  test("medium model 100 => interval 10", () => {
    expect(chooseEngineeringInterval(100)).toBe(10);
  });
  test("large model 1200 => interval 200", () => {
    expect(chooseEngineeringInterval(1200)).toBe(200);
  });
  test("zero/NaN returns 10", () => {
    expect(chooseEngineeringInterval(0)).toBe(10);
    expect(chooseEngineeringInterval(NaN)).toBe(10);
    expect(chooseEngineeringInterval(-5)).toBe(10);
  });
  test("interval is 1,2,5 power", () => {
    for (const dim of [3,7,15,35,75,150,300,700]) {
      const iv = chooseEngineeringInterval(dim);
      const pow = Math.pow(10, Math.floor(Math.log10(iv)));
      const norm = iv / pow;
      expect([1,2,5,10].includes(norm)).toBe(true);
    }
  });
});

describe("viewDirectionForId Z-up", () => {
  test("top looks down +Z with Y up", () => {
    const { dir, up } = viewDirectionForId("top");
    expect(dir).toEqual(new THREE.Vector3(0,0,1));
    expect(up).toEqual(new THREE.Vector3(0,1,0));
  });
  test("bottom looks up -Z", () => {
    const { dir, up } = viewDirectionForId("bottom");
    expect(dir).toEqual(new THREE.Vector3(0,0,-1));
    expect(up).toEqual(new THREE.Vector3(0,1,0));
  });
  test("front/back are opposite on Y with Z up", () => {
    const f = viewDirectionForId("front");
    const b = viewDirectionForId("back");
    expect(f.dir).toEqual(new THREE.Vector3(0,-1,0));
    expect(b.dir).toEqual(new THREE.Vector3(0,1,0));
    expect(f.up).toEqual(new THREE.Vector3(0,0,1));
  });
  test("left/right opposite on X", () => {
    const l = viewDirectionForId("left");
    const r = viewDirectionForId("right");
    expect(l.dir).toEqual(new THREE.Vector3(-1,0,0));
    expect(r.dir).toEqual(new THREE.Vector3(1,0,0));
  });
  test("iso shows all three axes", () => {
    const { dir } = viewDirectionForId("iso");
    expect(dir.x).not.toBe(0);
    expect(dir.y).not.toBe(0);
    expect(dir.z).not.toBe(0);
    expect(Math.abs(dir.length() - 1)).toBeLessThan(1e-6);
  });
});

describe("computeFitDistance", () => {
  test("small cube fits with reasonable distance", () => {
    const bounds = { size: new THREE.Vector3(10,10,10), sphereRadius: 8.66 };
    const d = computeFitDistance(bounds, 45, 1.5, "perspective");
    expect(d).toBeGreaterThan(8);
    expect(d).toBeLessThan(100);
  });
  test("thin flat model fits", () => {
    const bounds = { size: new THREE.Vector3(100,100,1), sphereRadius: 70 };
    const d = computeFitDistance(bounds, 45, 1, "perspective");
    expect(d).toBeGreaterThan(70);
  });
  test("long cylinder along X fits", () => {
    const bounds = { size: new THREE.Vector3(500,20,20), sphereRadius: 250 };
    const dPersp = computeFitDistance(bounds, 45, 1.2, "perspective");
    const dOrtho = computeFitDistance(bounds, 45, 1.2, "orthographic");
    expect(dPersp).toBeGreaterThan(100);
    expect(dOrtho).toBeGreaterThan(50);
  });
  test("orthographic distance independent of FOV detail", () => {
    const b = { size: new THREE.Vector3(100,100,100), sphereRadius: 86 };
    expect(computeFitDistance(b, 45, 1, "orthographic")).toBeCloseTo(computeFitDistance(b, 60, 1.5, "orthographic"));
  });
});

describe("computeDisplayScale", () => {
  test("normal size 100 => scale 1", () => {
    expect(computeDisplayScale(100)).toBe(1);
  });
  test("tiny 0.05 => scale 1 (no scaling for <0.1)", () => {
    expect(computeDisplayScale(0.05)).toBe(1);
  });
  test("huge 1000 => scale ~0.12", () => {
    expect(computeDisplayScale(1000)).toBeCloseTo(120/1000);
  });
  test("small 10 => scale 12", () => {
    expect(computeDisplayScale(10)).toBeCloseTo(12);
  });
});

describe("coordinate conversion", () => {
  test("display↔original with scale 2", () => {
    const p = new THREE.Vector3(10,20,30);
    const disp = originalToDisplay(p, 2);
    expect(disp).toEqual(new THREE.Vector3(20,40,60));
    const orig = displayToOriginal(disp, 2);
    expect(orig.x).toBeCloseTo(p.x);
    expect(orig.y).toBeCloseTo(p.y);
    expect(orig.z).toBeCloseTo(p.z);
  });
  test("scale 1 preserves", () => {
    const p = new THREE.Vector3(5, -3, 12);
    expect(displayToOriginal(p, 1)).toEqual(p);
    expect(originalToDisplay(p, 1)).toEqual(p);
  });
  test("far from origin preserved", () => {
    const p = new THREE.Vector3(10000, -5000, 200);
    const s = 0.012;
    const d = originalToDisplay(p, s);
    const back = displayToOriginal(d, s);
    expect(back.x).toBeCloseTo(p.x);
    expect(back.y).toBeCloseTo(p.y);
  });
});
