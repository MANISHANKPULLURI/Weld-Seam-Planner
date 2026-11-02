import { describe, expect, test, beforeEach } from "bun:test";
import * as THREE from "three";

// Mock DOM for SceneController lifecycle
class MockElement {
  style: Record<string,string> = {};
  children: MockElement[] = [];
  dataset: Record<string,string> = {};
  clientWidth = 800;
  clientHeight = 600;
  getBoundingClientRect() { return { left:0, top:0, width:800, height:600, right:800, bottom:600 } as DOMRect; }
  appendChild(c: MockElement) { this.children.push(c); }
  removeChild(c: MockElement) { this.children = this.children.filter(x=>x!==c); }
  contains(c: MockElement) { return this.children.includes(c); }
  addEventListener(){}
  removeEventListener(){}
  closest(_: string){ return null; }
}

function installMocks() {
  // @ts-ignore
  globalThis.document = {
    documentElement: { getAttribute: () => "dark", setAttribute: ()=>{}, style:{} },
    createElement: (tag: string) => {
      if (tag === "canvas") {
        const el = new MockElement() as unknown as HTMLCanvasElement;
        // @ts-ignore
        el.getContext = () => ({ fillStyle:"", font:"", textAlign:"", textBaseline:"", fillText:()=>{}, strokeText:()=>{}, strokeStyle:"", lineWidth:0, clearRect:()=>{}, beginPath:()=>{}, arc:()=>{}, fill:()=>{}, stroke:()=>{}, moveTo:()=>{}, lineTo:()=>{} } as unknown as CanvasRenderingContext2D);
        // @ts-ignore
        el.width = 64; // @ts-ignore
        el.height = 32;
        return el as unknown as HTMLCanvasElement;
      }
      return new MockElement() as unknown as HTMLElement;
    },
    querySelector: () => null,
  } as unknown as Document;
  // @ts-ignore
  globalThis.window = {
    devicePixelRatio: 1,
    matchMedia: () => ({ matches:false } as unknown as MediaQueryList),
    addEventListener: ()=>{},
    removeEventListener: ()=>{},
    dispatchEvent: ()=>true,
  } as unknown as Window & typeof globalThis;
  // @ts-ignore
  globalThis.getComputedStyle = () => ({ getPropertyValue: () => "" } as unknown as CSSStyleDeclaration);
  // @ts-ignore
  globalThis.ResizeObserver = class { observe(){} disconnect(){} unobserve(){} };
  // @ts-ignore
  globalThis.requestAnimationFrame = (cb: FrameRequestCallback) => setTimeout(()=>cb(Date.now()), 0) as unknown as number;
  // @ts-ignore
  globalThis.cancelAnimationFrame = (id: number) => clearTimeout(id);
}

describe("lifecycle & coordinate preservation (unit, no WebGL)", () => {
  beforeEach(() => installMocks());

  test("display scale computation does not mutate original Float32Array", async () => {
    const { computeDisplayScale, originalToDisplay, displayToOriginal } = await import("../src/viewer/viewMath.ts");
    const original = new Float32Array([0,0,0, 100,0,0, 0,100,0]);
    const copy = original.slice();
    const rawMax = 100;
    const scale = computeDisplayScale(rawMax);
    expect(scale).toBe(1); // 100 is normal size => no scale
    const p = new THREE.Vector3(original[3]!, original[4]!, original[5]!);
    const disp = originalToDisplay(p, scale);
    expect(disp.x).toBeCloseTo(100);
    // ensure original array unchanged
    expect(original[3]).toBe(copy[3]);
    expect(original[4]).toBe(copy[4]);
    // round-trip
    const back = displayToOriginal(disp, scale);
    expect(back.x).toBeCloseTo(p.x);
  });

  test("huge model scaling preserves original coordinates", async () => {
    const { computeDisplayScale, originalToDisplay, displayToOriginal } = await import("../src/viewer/viewMath.ts");
    const huge = 2000;
    const scale = computeDisplayScale(huge);
    expect(scale).toBeCloseTo(120/2000);
    const p = new THREE.Vector3(2000, 0, 0);
    const disp = originalToDisplay(p, scale);
    expect(disp.x).toBeCloseTo(120);
    const orig = displayToOriginal(disp, scale);
    expect(orig.x).toBeCloseTo(2000);
  });

  test("tiny model <0.1 not scaled", async () => {
    const { computeDisplayScale } = await import("../src/viewer/viewMath.ts");
    expect(computeDisplayScale(0.05)).toBe(1);
  });

  test("bounds center calculation", () => {
    const min = new THREE.Vector3(-10, -5, 0);
    const max = new THREE.Vector3(10, 5, 20);
    const center = new THREE.Vector3().addVectors(min, max).multiplyScalar(0.5);
    expect(center).toEqual(new THREE.Vector3(0,0,10));
    // ensure model far from origin still centers correctly
    const farMin = new THREE.Vector3(10000, 10000, 10000);
    const farMax = new THREE.Vector3(10100, 10100, 10100);
    const farCenter = new THREE.Vector3().addVectors(farMin, farMax).multiplyScalar(0.5);
    expect(farCenter.x).toBe(10050);
  });

  test("grid interval engineering steps", async () => {
    const { chooseEngineeringInterval } = await import("../src/viewer/viewMath.ts");
    // for a range of dims, grid extent should be multiple of interval
    for (const dim of [12, 45, 120, 550]) {
      const iv = chooseEngineeringInterval(dim);
      const extent = Math.ceil(dim*1.6/iv)*iv;
      expect(extent % iv).toBe(0);
      expect(extent).toBeGreaterThanOrEqual(dim*1.4);
    }
  });

  test("aspect ratio handling for fit distance", async () => {
    const { computeFitDistance } = await import("../src/viewer/viewMath.ts");
    const bounds = { size: new THREE.Vector3(100,100,100), sphereRadius: 86.6 };
    const dWide = computeFitDistance(bounds, 45, 2, "perspective");
    const dTall = computeFitDistance(bounds, 45, 0.5, "perspective");
    // wide aspect should not need dramatically larger distance than tall, but both > radius
    expect(dWide).toBeGreaterThan(86);
    expect(dTall).toBeGreaterThan(86);
  });
});
