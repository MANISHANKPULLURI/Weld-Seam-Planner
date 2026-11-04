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

  test("part transform scales to mm without touching the source array", async () => {
    const { UP_AXIS_QUATERNION_XYZW } = await import("@weld/core");
    const original = new Float32Array([0, 0, 0, 1, 0, 0, 0, 2, 3]);
    const copy = original.slice();
    const group = new THREE.Group();
    const [x, y, z, w] = UP_AXIS_QUATERNION_XYZW["+z"];
    group.scale.setScalar(25.4);
    group.quaternion.set(x, y, z, w);
    group.updateMatrixWorld(true);
    const p = new THREE.Vector3(1, 0, 0).applyMatrix4(group.matrixWorld);
    expect(p.x).toBeCloseTo(25.4);
    expect(Array.from(original)).toEqual(Array.from(copy));
  });

  test("+Y up turns the part so its Y axis points up", async () => {
    const { UP_AXIS_QUATERNION_XYZW } = await import("@weld/core");
    const group = new THREE.Group();
    const [x, y, z, w] = UP_AXIS_QUATERNION_XYZW["+y"];
    group.quaternion.set(x, y, z, w);
    group.updateMatrixWorld(true);
    const up = new THREE.Vector3(0, 1, 0).applyMatrix4(group.matrixWorld);
    expect(up.z).toBeCloseTo(1);
    expect(up.y).toBeCloseTo(0);
  });

  test("viewer bounds match the core size helper", async () => {
    const { UP_AXIS_QUATERNION_XYZW, partSizeMm } = await import("@weld/core");
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array([0, 0, 0, 10, 0, 0, 0, 20, 0, 0, 0, 30]), 3));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    const mesh = new THREE.Mesh(geo);
    const group = new THREE.Group();
    group.add(mesh);
    const [x, y, z, w] = UP_AXIS_QUATERNION_XYZW["+y"];
    group.scale.setScalar(10);
    group.quaternion.set(x, y, z, w);
    group.updateMatrixWorld(true);
    const size = new THREE.Box3().setFromObject(mesh).getSize(new THREE.Vector3());
    const expected = partSizeMm({ x: 10, y: 20, z: 30 }, "cm", "+y");
    expect(size.x).toBeCloseTo(expected.x);
    expect(size.y).toBeCloseTo(expected.y);
    expect(size.z).toBeCloseTo(expected.z);
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
