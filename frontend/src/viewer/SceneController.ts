import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";
import { chooseEngineeringInterval, viewDirectionForId as viewDir, computeFitDistance as calcFitDistance, computeDisplayScale, displayToOriginal, originalToDisplay } from "./viewMath.ts";
import { explodedOffset } from "./assemblyMath.ts";
import type { ComponentTransform } from "../state/store.ts";

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export type ViewId = "iso" | "top" | "bottom" | "front" | "back" | "left" | "right";

type ViewMode = "solid" | "wireframe";

export class SceneController {
  private scene: THREE.Scene;
  private renderer: THREE.WebGLRenderer;
  private cameraPersp: THREE.PerspectiveCamera;
  private cameraOrtho: THREE.OrthographicCamera;
  private camera: THREE.PerspectiveCamera | THREE.OrthographicCamera;
  private controls: OrbitControls;
  private grid: THREE.Group;
  private axes: THREE.Group;
  private mesh: THREE.Mesh | null = null;
  private triangleEdges: THREE.LineSegments | null = null;
  private componentMeshes: Map<string, THREE.Mesh> = new Map();
  private componentData: Map<string, { bounds: { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number }; size: { x: number; y: number; z: number } }; transform: ComponentTransform; visible: boolean; locked: boolean }> = new Map();
  private transformControls: TransformControls | null = null;
  private selectedId: string | null = null;
  private isolatedId: string | null = null;
  private explodedFactor = 0;
  private transformMode: "translate" | "rotate" = "translate";
  private assemblyBoxHelper: THREE.Box3Helper | null = null;
  private selectedBoxHelper: THREE.Box3Helper | null = null;
  private onSelectComponent?: (id: string | null) => void;
  private onTransformChange?: (id: string, transform: ComponentTransform) => void;
  private lights: THREE.Object3D[] = [];
  private host: HTMLElement;
  private raf: number | null = null;
  private projection: "perspective" | "orthographic" = "perspective";
  private viewMode: ViewMode = "solid";
  private size = { w: 1, h: 1 };
  private bounds: { min: THREE.Vector3; max: THREE.Vector3; size: THREE.Vector3; center: THREE.Vector3; sphereRadius: number } | null = null;
  private displayScale = 1;
  private originalPositions: Float32Array | null = null;
  private originalIndices: Uint32Array | null = null;
  private raycaster = new THREE.Raycaster();
  private mouse = new THREE.Vector2();
  private onDblClickHandler: ((e: MouseEvent) => void) | null = null;
  private onContextMenuHandler: ((e: MouseEvent) => void) | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;
  private themeHandler: (() => void) | null = null;

  private onViewChange?: (id: ViewId) => void;

  constructor(host: HTMLElement) {
    this.host = host;
    this.scene = new THREE.Scene();
    const bg = cssVar("--bg-viewport");
    if (bg) this.scene.background = new THREE.Color(bg);
    this.scene.up.set(0, 0, 1);

    this.cameraPersp = new THREE.PerspectiveCamera(45, 1, 0.1, 10000);
    this.cameraPersp.position.set(120, -120, 120);
    this.cameraPersp.up.set(0, 0, 1);

    this.cameraOrtho = new THREE.OrthographicCamera(-100, 100, 100, -100, 0.1, 10000);
    this.cameraOrtho.position.copy(this.cameraPersp.position);
    this.cameraOrtho.up.set(0, 0, 1);
    this.camera = this.cameraPersp;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.domElement.style.display = "block";
    this.renderer.domElement.style.width = "100%";
    this.renderer.domElement.style.height = "100%";
    host.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.configureControls();

    this.transformControls = new TransformControls(this.camera, this.renderer.domElement);
    this.transformControls.setMode(this.transformMode);
    this.transformControls.addEventListener("dragging-changed", (event) => {
      this.controls.enabled = !event.value;
      if (!event.value) {
        const obj = this.transformControls?.object as THREE.Mesh | null;
        if (obj && this.onTransformChange) {
          const id = (obj.userData as { componentId?: string }).componentId;
          if (id) {
            const locked = this.componentData.get(id)?.locked;
            if (!locked) {
              const exploded = this.explodedFactor;
              let ex = 0, ey = 0, ez = 0;
              if (exploded > 0) {
                const data = this.componentData.get(id);
                if (data) {
                  const c = { x: (data.bounds.min.x + data.bounds.max.x) / 2, y: (data.bounds.min.y + data.bounds.max.y) / 2, z: (data.bounds.min.z + data.bounds.max.z) / 2 };
                  let ac = new THREE.Vector3(0, 0, 0); let cnt = 0;
                  for (const d of this.componentData.values()) { ac.x += (d.bounds.min.x + d.bounds.max.x) / 2; ac.y += (d.bounds.min.y + d.bounds.max.y) / 2; ac.z += (d.bounds.min.z + d.bounds.max.z) / 2; cnt++; }
                  if (cnt > 0) { ac.x /= cnt; ac.y /= cnt; ac.z /= cnt; }
                  const off = explodedOffset(c as unknown as { x: number; y: number; z: number }, { x: ac.x, y: ac.y, z: ac.z } as unknown as { x: number; y: number; z: number }, exploded);
                  ex = off.x * this.displayScale; ey = off.y * this.displayScale; ez = off.z * this.displayScale;
                }
              }
              const p = obj.position;
              const r = obj.rotation;
              const t: ComponentTransform = {
                position: { x: (p.x - ex) / this.displayScale, y: (p.y - ey) / this.displayScale, z: (p.z - ez) / this.displayScale },
                rotation: { x: (r.x * 180) / Math.PI, y: (r.y * 180) / Math.PI, z: (r.z * 180) / Math.PI },
              };
              this.componentData.set(id, { ...(this.componentData.get(id)!), transform: t });
              this.onTransformChange(id, t);
              this.updateBoundsForTransforms();
            }
          }
        }
      }
    });
    this.scene.add(this.transformControls as unknown as THREE.Object3D);
    this.renderer.domElement.addEventListener("click", (e) => this.handleClick(e));
    this.grid = new THREE.Group();
    this.axes = new THREE.Group();
    this.scene.add(this.grid);
    this.scene.add(this.axes);
    this.buildGridForBounds(null);
    this.buildAxesForBounds(null);

    this.onContextMenuHandler = (e: MouseEvent) => {
      if ((e.target as HTMLElement)?.closest(".viewport-canvas")) e.preventDefault();
    };
    this.renderer.domElement.addEventListener("contextmenu", this.onContextMenuHandler);

    this.onDblClickHandler = (e: MouseEvent) => this.handleDoubleClick(e);
    this.renderer.domElement.addEventListener("dblclick", this.onDblClickHandler);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
    requestAnimationFrame(() => this.resize());
    this.render();

    this.keyHandler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
      if (e.key.toLowerCase() === "r") this.resetView();
      if (e.key.toLowerCase() === "f") this.fitModel(true);
      if (e.key.toLowerCase() === "w") this.cycleViewMode();
    };
    window.addEventListener("keydown", this.keyHandler);

    (this as unknown as { _cleanup: () => void })._cleanup = () => this.disposeInternal();
  }

  private configureControls() {
    this.controls.enableDamping = false;
    this.controls.dampingFactor = 0.08;
    this.controls.enablePan = true;
    this.controls.enableZoom = true;
    this.controls.enableRotate = true;
    this.controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.PAN,
      RIGHT: THREE.MOUSE.PAN,
    };
    this.controls.touches = {
      ONE: THREE.TOUCH.ROTATE,
      TWO: THREE.TOUCH.DOLLY_PAN,
    };
    this.controls.minDistance = 1;
    this.controls.maxDistance = 1e6;
    this.cameraPersp.near = 0.1;
    this.cameraPersp.far = 1e6;
    this.cameraOrtho.near = 0.1;
    this.cameraOrtho.far = 1e6;
    this.controls.addEventListener("change", () => this.render());
  }

  private cycleViewMode() {
    const order: ViewMode[] = ["solid", "wireframe"];
    const idx = order.indexOf(this.viewMode);
    this.setViewMode(order[(idx + 1) % order.length]!);
  }


  private buildGridForBounds(bounds: typeof this.bounds) {
    this.grid.clear();
    const maxDim = bounds ? Math.max(bounds.size.x, bounds.size.y, bounds.size.z) : 400;
    const interval = chooseEngineeringInterval(maxDim);
    const rawExtent = maxDim > 0 ? maxDim * 1.6 : 400;
    const extent = Math.max(interval * 4, Math.ceil(rawExtent / interval) * interval);
    const divisions = Math.max(4, Math.min(40, Math.round(extent / interval)));
    const size = extent;
    const main = new THREE.Color(cssVar("--grid-main") || cssVar("--rev-green-t3") || "#465B32");
    const sub = new THREE.Color(cssVar("--grid-sub") || cssVar("--rev-green") || "#283B1F");
    const g = new THREE.GridHelper(size, divisions, main, sub);
    g.rotation.x = Math.PI / 2;
    this.grid.add(g);
    if (bounds) {
      const center = bounds.center;
      this.grid.position.set(center.x, center.y, bounds.min.z);
    } else {
      this.grid.position.set(0, 0, 0);
    }
  }

  private buildAxesForBounds(bounds: typeof this.bounds) {
    this.axes.clear();
    const maxDim = bounds ? Math.max(bounds.size.x, bounds.size.y, bounds.size.z) : 60;
    const axisLen = Math.max(12, Math.min(120, maxDim * 0.4));
    const helper = new THREE.AxesHelper(axisLen);
    this.axes.add(helper);
    const labels: [string, THREE.Vector3, string][] = [
      ["X", new THREE.Vector3(axisLen + 4, 0, 0), cssVar("--axis-x") || "#ff4d4d"],
      ["Y", new THREE.Vector3(0, axisLen + 4, 0), cssVar("--axis-y") || "#4dff4d"],
      ["Z", new THREE.Vector3(0, 0, axisLen + 4), cssVar("--axis-z") || "#4d7dff"],
    ];
    for (const [text, pos, color] of labels) {
      const canvas = document.createElement("canvas");
      canvas.width = 64; canvas.height = 32;
      const ctx = canvas.getContext("2d")!;
      const cssColor = cssVar("--text-secondary") || "#ABABA5";
      ctx.fillStyle = cssColor;
      ctx.font = "bold 16px '42dot Sans', system-ui, sans-serif";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.strokeStyle = "rgba(0,0,0,0.35)";
      ctx.lineWidth = 3;
      ctx.strokeText(text, 32, 16);
      ctx.fillText(text, 32, 16);
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false });
      const spr = new THREE.Sprite(mat);
      spr.position.copy(pos);
      spr.scale.set(10, 5, 1);
      spr.renderOrder = 999;
      this.axes.add(spr);
      const tipGeo = new THREE.SphereGeometry(1.2, 8, 8);
      const tipMat = new THREE.MeshBasicMaterial({ color });
      const tip = new THREE.Mesh(tipGeo, tipMat);
      tip.position.copy(pos).sub(new THREE.Vector3().copy(pos).normalize().multiplyScalar(2));
      this.axes.add(tip);
    }
    if (bounds) {
      this.axes.position.copy(bounds.min);
    } else {
      this.axes.position.set(0, 0, 0);
    }
  }


  setProjection(p: "perspective" | "orthographic") {
    if (this.projection === p) return;
    const oldCam = this.camera;
    const target = this.controls.target.clone();
    const pos = oldCam.position.clone();
    const quat = oldCam.quaternion.clone();
    this.projection = p;
    this.camera = p === "perspective" ? this.cameraPersp : this.cameraOrtho;
    this.camera.position.copy(pos);
    this.camera.quaternion.copy(quat);
    this.controls.object = this.camera;
    if (this.transformControls) (this.transformControls as unknown as { camera: THREE.Camera }).camera = this.camera;
    this.controls.target.copy(target);
    this.controls.update();
    this.updateOrthoFrustum();
    this.updateClippingPlanes();
    this.render();
  }

  private updateOrthoFrustum() {
    if (this.projection !== "orthographic") return;
    const aspect = this.size.w / Math.max(1, this.size.h);
    if (this.bounds) {
      const maxDim = Math.max(this.bounds.size.x, this.bounds.size.y, this.bounds.size.z);
      const interval = chooseEngineeringInterval(maxDim);
      const rawExtent = maxDim * 1.6;
      const extent = Math.max(interval * 4, Math.ceil(rawExtent / interval) * interval);
      const halfH = Math.max(extent * 0.55, 10);
      const halfW = halfH * aspect;
      this.cameraOrtho.left = -halfW;
      this.cameraOrtho.right = halfW;
      this.cameraOrtho.top = halfH;
      this.cameraOrtho.bottom = -halfH;
    } else {
      const halfH = 200;
      const halfW = halfH * aspect;
      this.cameraOrtho.left = -halfW;
      this.cameraOrtho.right = halfW;
      this.cameraOrtho.top = halfH;
      this.cameraOrtho.bottom = -halfH;
    }
    this.cameraOrtho.updateProjectionMatrix();
  }


  setViewMode(mode: ViewMode) {
    this.viewMode = mode;
    const solidColor = cssVar("--part-solid") || (document.documentElement.getAttribute("data-theme")==="light" ? "#141E00" : "#C5C5BD");
    const wireColor = cssVar("--bright-discovery") || cssVar("--discovery") || "#EF7F01";
    const apply = (m: THREE.Mesh) => {
      const mat = m.material as THREE.MeshStandardMaterial;
      mat.wireframe = mode === "wireframe";
      mat.needsUpdate = true;
      mat.color = new THREE.Color(mode === "wireframe" ? wireColor : solidColor);
    };
    if (this.mesh) apply(this.mesh);
    for (const mm of this.componentMeshes.values()) apply(mm);
    if (this.triangleEdges) this.triangleEdges.visible = false;
    this.render();
  }

  setWireframe(v: boolean) {
    this.setViewMode(v ? "wireframe" : "solid");
  }

  updateTheme() {
    const bg = cssVar("--bg-viewport");
    if (bg) this.scene.background = new THREE.Color(bg);
    if (this.mesh) {
      this.setViewMode(this.viewMode);
    }
    this.buildGridForBounds(this.bounds);
    this.buildAxesForBounds(this.bounds);
    if (this.triangleEdges) {
      (this.triangleEdges.material as THREE.LineBasicMaterial).color = new THREE.Color(cssVar("--bright-discovery") || cssVar("--discovery") || "#EF7F01");
    }
    this.render();
  }


  setView(id: ViewId) { this.animateToView(id); }

  resetView() { this.animateToView("iso"); }

  fitModel(animate = true) {
    if (!this.bounds) {
      this.animateToView("iso");
      this.updateOrthoFrustum();
      this.updateClippingPlanes();
      return;
    }
    const center = this.bounds.center.clone();
    const currentDir = this.camera.position.clone().sub(this.controls.target).normalize();
    const isZero = currentDir.lengthSq() < 1e-6;
    const dir = isZero ? new THREE.Vector3(0.7, -0.6, 0.7).normalize() : currentDir;
    const distance = this.computeFitDistance(center);
    const targetPos = center.clone().add(dir.multiplyScalar(distance));
    this.animateCamera(this.camera.position.clone(), targetPos, this.controls.target.clone(), center, animate ? 500 : 0);
    this.updateClippingPlanesForDistance(distance);
    this.updateOrthoFrustum();
  }

  private computeFitDistance(_center: THREE.Vector3): number {
    if (!this.bounds) return 200;
    const aspect = this.size.w / Math.max(1, this.size.h);
    return calcFitDistance(this.bounds, this.cameraPersp.fov, aspect, this.projection);
  }

  private updateClippingPlanesForDistance(distance: number) {
    if (!this.bounds) return;
    const radius = this.bounds.sphereRadius;
    const near = Math.max(0.1, distance - radius * 2.5);
    const far = distance + radius * 3.5 + 500;
    this.cameraPersp.near = near;
    this.cameraPersp.far = far;
    this.cameraPersp.updateProjectionMatrix();
    this.cameraOrtho.near = near;
    this.cameraOrtho.far = far;
    this.cameraOrtho.updateProjectionMatrix();
  }

  private updateClippingPlanes() {
    if (!this.bounds) {
      this.cameraPersp.near = 0.1; this.cameraPersp.far = 10000;
      this.cameraPersp.updateProjectionMatrix();
      this.cameraOrtho.near = 0.1; this.cameraOrtho.far = 10000;
      this.cameraOrtho.updateProjectionMatrix();
      return;
    }
    const dist = this.camera.position.distanceTo(this.controls.target);
    this.updateClippingPlanesForDistance(dist);
  }

  private viewDirectionForId(id: ViewId, _distance: number): { dir: THREE.Vector3; up: THREE.Vector3 } {
    return viewDir(id);
  }

  private animateToView(id: ViewId) {
    const center = this.bounds ? this.bounds.center.clone() : new THREE.Vector3(0, 0, 0);
    const distance = this.bounds ? this.computeFitDistance(center) : 200;
    const { dir, up } = this.viewDirectionForId(id, distance);
    const targetPos = center.clone().add(dir.multiplyScalar(distance));
    const cam = this.camera;
    const wasProjection = this.projection;
    this.animateCamera(cam.position.clone(), targetPos, this.controls.target.clone(), center, 400, up);
    this.updateClippingPlanesForDistance(distance);
    if (wasProjection === "orthographic") this.updateOrthoFrustum();
    if (this.onViewChange) this.onViewChange(id);
  }

  private animateCamera(startPos: THREE.Vector3, endPos: THREE.Vector3, startTarget: THREE.Vector3, endTarget: THREE.Vector3, durationMs: number, endUp?: THREE.Vector3) {
    if (durationMs === 0 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      this.camera.position.copy(endPos);
      this.controls.target.copy(endTarget);
      if (endUp) { this.camera.up.copy(endUp); this.cameraPersp.up.copy(endUp); this.cameraOrtho.up.copy(endUp); }
      this.controls.update();
      this.render();
      return;
    }
    const startQuat = this.camera.quaternion.clone();
    const tmpCam = this.camera.clone() as THREE.PerspectiveCamera | THREE.OrthographicCamera;
    tmpCam.position.copy(endPos);
    if (endUp) tmpCam.up.copy(endUp);
    tmpCam.lookAt(endTarget);
    const endQuat = tmpCam.quaternion.clone();
    const t0 = performance.now();
    const ease = (t: number) => 1 - Math.pow(1 - t, 3);
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / durationMs);
      const e = ease(t);
      this.camera.position.lerpVectors(startPos, endPos, e);
      this.controls.target.lerpVectors(startTarget, endTarget, e);
      this.camera.quaternion.copy(startQuat).slerp(endQuat, e);
      if (endUp && t === 1) {
        this.camera.up.copy(endUp);
        this.cameraPersp.up.copy(endUp);
        this.cameraOrtho.up.copy(endUp);
      }
      this.controls.update();
      this.render();
      if (t < 1) requestAnimationFrame(step);
      else {
        this.updateClippingPlanes();
        if (this.projection === "orthographic") this.updateOrthoFrustum();
      }
    };
    requestAnimationFrame(step);
  }


  private handleClick(e: MouseEvent) {
    if (this.transformControls && (this.transformControls as unknown as { dragging: boolean }).dragging) return;
    const targetEl = e.target as HTMLElement;
    if (targetEl.closest(".view-controls") || targetEl.closest(".orientation-gizmo") || targetEl.closest("button")) return;
    if (this.componentMeshes.size === 0) return;
    if (this.host.dataset.tool === "draw") return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const targets: THREE.Object3D[] = [];
    for (const m of this.componentMeshes.values()) if (m.visible) targets.push(m);
    if (targets.length === 0) return;
    const hits = this.raycaster.intersectObjects(targets, false);
    if (hits.length > 0) {
      const hit = hits[0]!;
      const obj = hit.object as THREE.Mesh;
      const id = (obj.userData as { componentId?: string }).componentId ?? null;
      if (this.onSelectComponent) this.onSelectComponent(id);
      this.setSelection(id);
    } else {
      if (this.onSelectComponent) this.onSelectComponent(null);
      this.setSelection(null);
    }
  }

  private handleDoubleClick(e: MouseEvent) {
    const targetEl = e.target as HTMLElement;
    if (targetEl.closest(".view-controls") || targetEl.closest(".orientation-gizmo") || targetEl.closest("button")) return;
    try {
      const isDraw = (document.querySelector(".viewport-host-draw") !== null);
      if (isDraw) return;
    } catch {}
    if (this.host.dataset.tool === "draw") return;
    if (!this.mesh && this.componentMeshes.size === 0) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const targets: THREE.Object3D[] = [];
    if (this.mesh) targets.push(this.mesh);
    for (const m of this.componentMeshes.values()) targets.push(m);
    const hits = this.raycaster.intersectObjects(targets, false);
    if (hits.length === 0) return;
    const hit = hits[0]!;
    const pointDisplay = hit.point.clone();
    const dir = this.camera.position.clone().sub(this.controls.target).normalize();
    const dist = this.camera.position.distanceTo(this.controls.target);
    const newTarget = pointDisplay.clone();
    const newPos = newTarget.clone().add(dir.multiplyScalar(dist));
    this.animateCamera(this.camera.position.clone(), newPos, this.controls.target.clone(), newTarget, 350);
  }


  getDisplayScale(): number { return this.displayScale; }

  getOriginalFromDisplay(pt: THREE.Vector3): THREE.Vector3 {
    return displayToOriginal(pt, this.displayScale);
  }

  getDisplayFromOriginal(pt: THREE.Vector3): THREE.Vector3 {
    return originalToDisplay(pt, this.displayScale);
  }

  raycastOriginal(event: MouseEvent): THREE.Vector3 | null {
    if (!this.mesh && this.componentMeshes.size === 0) return null;
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const targets: THREE.Object3D[] = [];
    if (this.mesh) targets.push(this.mesh);
    for (const m of this.componentMeshes.values()) targets.push(m);
    const hits = this.raycaster.intersectObjects(targets, false);
    if (hits.length === 0) return null;
    return this.getOriginalFromDisplay(hits[0]!.point.clone());
  }


  setMesh(positions: Float32Array, indices: Uint32Array) {
    this.originalPositions = positions.slice();
    this.originalIndices = indices.slice();

    if (this.mesh) {
      this.scene.remove(this.mesh);
      this.mesh.geometry.dispose();
      (this.mesh.material as THREE.Material).dispose();
      this.mesh = null;
    }
    if (this.triangleEdges) {
      this.scene.remove(this.triangleEdges);
      this.triangleEdges.geometry.dispose();
      (this.triangleEdges.material as THREE.Material).dispose();
      this.triangleEdges = null;
    }
    for (const l of this.lights) this.scene.remove(l);
    this.lights = [];

    if (positions.length === 0 || indices.length === 0) {
      this.bounds = null;
      this.displayScale = 1;
      this.buildGridForBounds(null);
      this.buildAxesForBounds(null);
      this.render();
      return;
    }

    const tmp = new THREE.BufferGeometry();
    tmp.setAttribute("position", new THREE.BufferAttribute(positions.slice(), 3));
    tmp.computeBoundingBox();
    const rawBox = tmp.boundingBox!;
    const rawSize = new THREE.Vector3().subVectors(rawBox.max, rawBox.min);
    const rawMax = Math.max(rawSize.x, rawSize.y, rawSize.z) || 1;
    this.displayScale = computeDisplayScale(rawMax);

    const scaled = new Float32Array(positions.length);
    for (let i = 0; i < positions.length; i++) scaled[i] = positions[i]! * this.displayScale;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(scaled, 3));
    geo.setIndex(new THREE.BufferAttribute(indices, 1));
    geo.computeVertexNormals();
    geo.computeBoundingBox();
    geo.computeBoundingSphere();
    const box = geo.boundingBox!;
    const sphere = geo.boundingSphere!;
    const size = new THREE.Vector3().subVectors(box.max, box.min);
    const center = new THREE.Vector3().addVectors(box.min, box.max).multiplyScalar(0.5);
    this.bounds = { min: box.min.clone(), max: box.max.clone(), size, center, sphereRadius: sphere.radius };

    const solidColor = cssVar("--part-solid") || (document.documentElement.getAttribute("data-theme")==="light" ? "#141E00" : "#C5C5BD");
    const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(solidColor), flatShading: false, wireframe: false, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.userData.isModel = true;

    const lightColor = cssVar("--light-sand") || "#F6F6EE";
    const hemi = new THREE.HemisphereLight(lightColor, cssVar("--dark-forest-t2") || "#0E1600", 1.1);
    const dirLight = new THREE.DirectionalLight(lightColor, 0.9);
    dirLight.position.set(120, -80, 200);
    const fill = new THREE.DirectionalLight(lightColor, 0.35);
    fill.position.set(-80, 120, 100);
    this.scene.add(hemi); this.scene.add(dirLight); this.scene.add(fill);
    this.lights.push(hemi, dirLight, fill);
    this.scene.add(this.mesh);

    this.buildGridForBounds(this.bounds);
    this.buildAxesForBounds(this.bounds);
    this.setViewMode(this.viewMode);
    this.fitModel(false);
    tmp.dispose();
  }

  clearMesh() {
    if (this.mesh) { this.scene.remove(this.mesh); this.mesh.geometry.dispose(); (this.mesh.material as THREE.Material).dispose(); this.mesh = null; }
    if (this.triangleEdges) { this.scene.remove(this.triangleEdges); this.triangleEdges.geometry.dispose(); (this.triangleEdges.material as THREE.Material).dispose(); this.triangleEdges = null; }
    this.clearComponents(false);
    for (const l of this.lights) this.scene.remove(l);
    this.lights = [];
    this.bounds = null;
    this.displayScale = 1;
    this.originalPositions = null;
    this.originalIndices = null;
    this.buildGridForBounds(null);
    this.buildAxesForBounds(null);
    this.render();
  }

  clearComponents(render = true) {
    for (const m of this.componentMeshes.values()) {
      this.scene.remove(m);
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    }
    this.componentMeshes.clear();
    if (render) {
      this.bounds = null;
      this.buildGridForBounds(null);
      this.buildAxesForBounds(null);
      this.render();
    }
  }

  setComponents(components: Array<{ id: string; positions: Float32Array; indices: Uint32Array; color?: string; transform?: ComponentTransform; visible?: boolean; locked?: boolean; bounds?: { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number }; size: { x: number; y: number; z: number } } }>) {
    this.clearMesh();
    this.clearComponents(false);
    if (components.length === 0) {
      this.componentData.clear();
      this.render();
      return;
    }
    let overallMin = new THREE.Vector3(Infinity, Infinity, Infinity);
    let overallMax = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
    const palette = ["#C5C5BD", "#8da08d", "#b8c4b8", "#EF7F01", "#648047", "#ABABA5"];
    for (let idx = 0; idx < components.length; idx++) {
      const comp = components[idx]!;
      if (comp.positions.length === 0 || comp.indices.length === 0) continue;
      const tmp = new THREE.BufferGeometry();
      tmp.setAttribute("position", new THREE.BufferAttribute(comp.positions.slice(), 3));
      tmp.computeBoundingBox();
      const box = tmp.boundingBox!;
      overallMin.min(box.min);
      overallMax.max(box.max);
      tmp.dispose();
    }
    const overallSize = new THREE.Vector3().subVectors(overallMax, overallMin);
    const rawMax = Math.max(overallSize.x, overallSize.y, overallSize.z) || 1;
    this.displayScale = computeDisplayScale(rawMax);
    this.componentData.clear();
    for (let idx = 0; idx < components.length; idx++) {
      const comp = components[idx]!;
      if (comp.positions.length === 0) continue;
      const scaled = new Float32Array(comp.positions.length);
      for (let i = 0; i < comp.positions.length; i++) scaled[i] = comp.positions[i]! * this.displayScale;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(scaled, 3));
      geo.setIndex(new THREE.BufferAttribute(comp.indices, 1));
      geo.computeVertexNormals();
      geo.computeBoundingBox();
      geo.computeBoundingSphere();
      const color = comp.color || palette[idx % palette.length]!;
      const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(color), flatShading: false, side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.userData.componentId = comp.id;
      const transform = comp.transform ?? { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 } };
      this.componentData.set(comp.id, { bounds: comp.bounds ?? { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 }, size: { x: 0, y: 0, z: 0 } }, transform, visible: comp.visible ?? true, locked: comp.locked ?? false });
      this.applyTransformToMesh(mesh, transform);
      mesh.visible = comp.visible ?? true;
      this.scene.add(mesh);
      this.componentMeshes.set(comp.id, mesh);
    }
    if (this.lights.length === 0) {
      const lightColor = cssVar("--light-sand") || "#F6F6EE";
      const hemi = new THREE.HemisphereLight(lightColor, cssVar("--dark-forest-t2") || "#0E1600", 1.1);
      const dirLight = new THREE.DirectionalLight(lightColor, 0.9);
      dirLight.position.set(120, -80, 200);
      const fill = new THREE.DirectionalLight(lightColor, 0.35);
      fill.position.set(-80, 120, 100);
      this.scene.add(hemi); this.scene.add(dirLight); this.scene.add(fill);
      this.lights.push(hemi, dirLight, fill);
    }
    this.updateBoundsForTransforms();
    this.applySelectionHighlight();
    this.applyVisibility();
    this.buildGridForBounds(this.bounds);
    this.buildAxesForBounds(this.bounds);
    if (this.bounds) this.fitModel(false); else this.render();
  }

  private applyTransformToMesh(mesh: THREE.Mesh, t: ComponentTransform) {
    const exploded = this.explodedFactor;
    let ex = 0, ey = 0, ez = 0;
    if (exploded > 0) {
      const data = this.componentData.get(mesh.userData.componentId as string);
      if (data) {
        const c = { x: (data.bounds.min.x + data.bounds.max.x) / 2, y: (data.bounds.min.y + data.bounds.max.y) / 2, z: (data.bounds.min.z + data.bounds.max.z) / 2 };
        let assemblyCenter = new THREE.Vector3(0, 0, 0);
        let count = 0;
        for (const d of this.componentData.values()) {
          assemblyCenter.x += (d.bounds.min.x + d.bounds.max.x) / 2;
          assemblyCenter.y += (d.bounds.min.y + d.bounds.max.y) / 2;
          assemblyCenter.z += (d.bounds.min.z + d.bounds.max.z) / 2;
          count++;
        }
        if (count > 0) { assemblyCenter.x /= count; assemblyCenter.y /= count; assemblyCenter.z /= count; }
        const off = explodedOffset(c as unknown as { x: number; y: number; z: number }, { x: assemblyCenter.x, y: assemblyCenter.y, z: assemblyCenter.z } as unknown as { x: number; y: number; z: number }, exploded);
        ex = off.x * this.displayScale; ey = off.y * this.displayScale; ez = off.z * this.displayScale;
      }
    }
    mesh.position.set(t.position.x * this.displayScale + ex, t.position.y * this.displayScale + ey, t.position.z * this.displayScale + ez);
    mesh.rotation.set((t.rotation.x * Math.PI) / 180, (t.rotation.y * Math.PI) / 180, (t.rotation.z * Math.PI) / 180);
    mesh.updateMatrixWorld();
  }

  updateBoundsForTransforms() {
    if (this.componentMeshes.size === 0) { this.bounds = null; return; }
    let min = new THREE.Vector3(Infinity, Infinity, Infinity);
    let max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
    let totalRadius = 0;
    for (const mesh of this.componentMeshes.values()) {
      if (!mesh.visible) continue;
      const box = new THREE.Box3().setFromObject(mesh);
      if (box.isEmpty()) continue;
      min.min(box.min); max.max(box.max);
      const sphere = new THREE.Sphere(); box.getBoundingSphere(sphere); totalRadius = Math.max(totalRadius, sphere.radius);
    }
    if (min.x === Infinity) { this.bounds = null; return; }
    const size = new THREE.Vector3().subVectors(max, min);
    const center = new THREE.Vector3().addVectors(min, max).multiplyScalar(0.5);
    const sphereRadius = totalRadius || Math.max(size.x, size.y, size.z) * 0.6;
    this.bounds = { min: min.clone(), max: max.clone(), size, center, sphereRadius };
    this.updateAssemblyBox();
    this.updateSelectedBox();
  }

  private applyVisibility() {
    for (const [id, mesh] of this.componentMeshes) {
      const data = this.componentData.get(id);
      const lockedVisible = data?.visible ?? true;
      const isolated = this.isolatedId;
      mesh.visible = isolated ? id === isolated && lockedVisible : lockedVisible;
    }
    if (this.isolatedId) { for (const [id, mesh] of this.componentMeshes) if (id !== this.isolatedId) mesh.visible = false; }
    this.updateBoundsForTransforms();
    this.render();
  }

  private applySelectionHighlight() {
    for (const [id, mesh] of this.componentMeshes) {
      const mat = mesh.material as THREE.MeshStandardMaterial;
      mat.emissive.setHex(id === this.selectedId ? 0x333300 : 0x000000);
      mat.needsUpdate = true;
    }
    if (this.transformControls) {
      const sel = this.selectedId ? this.componentMeshes.get(this.selectedId) ?? null : null;
      if (sel && !this.componentData.get(this.selectedId!)?.locked && sel.visible) {
        this.transformControls.attach(sel);
        (this.transformControls as unknown as THREE.Object3D).visible = true;
        this.transformControls.enabled = true;
      } else {
        this.transformControls.detach();
        (this.transformControls as unknown as THREE.Object3D).visible = false;
      }
    }
    this.updateSelectedBox();
    this.render();
  }

  setSelection(id: string | null) {
    this.selectedId = id;
    this.applySelectionHighlight();
  }

  setTransformMode(mode: "translate" | "rotate") {
    this.transformMode = mode;
    if (this.transformControls) this.transformControls.setMode(mode);
    this.render();
  }

  updateComponentTransform(id: string, t: ComponentTransform) {
    const data = this.componentData.get(id);
    if (!data || data.locked) return;
    data.transform = t;
    const mesh = this.componentMeshes.get(id);
    if (mesh) this.applyTransformToMesh(mesh, t);
    this.updateBoundsForTransforms();
    this.buildGridForBounds(this.bounds);
    this.buildAxesForBounds(this.bounds);
    this.render();
  }

  setVisibility(id: string, visible: boolean) {
    const data = this.componentData.get(id);
    if (data) data.visible = visible;
    this.applyVisibility();
    this.buildGridForBounds(this.bounds);
  }

  setIsolated(id: string | null) {
    this.isolatedId = id;
    this.applyVisibility();
  }

  setExplodedFactor(f: number) {
    this.explodedFactor = Math.max(0, Math.min(2, f));
    for (const [id, mesh] of this.componentMeshes) {
      const data = this.componentData.get(id);
      if (data) this.applyTransformToMesh(mesh, data.transform);
    }
    this.updateBoundsForTransforms();
    this.render();
  }

  resetTransform(id: string) {
    const data = this.componentData.get(id);
    if (!data) return;
    data.transform = { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 } };
    const mesh = this.componentMeshes.get(id);
    if (mesh) this.applyTransformToMesh(mesh, data.transform);
    if (this.onTransformChange) this.onTransformChange(id, data.transform);
    this.updateBoundsForTransforms();
    this.render();
  }

  fitSelected() {
    if (!this.selectedId) { this.fitModel(true); return; }
    const mesh = this.componentMeshes.get(this.selectedId);
    if (!mesh) { this.fitModel(true); return; }
    const box = new THREE.Box3().setFromObject(mesh);
    if (box.isEmpty()) return;
    const size = new THREE.Vector3().subVectors(box.max, box.min);
    const center = new THREE.Vector3().addVectors(box.min, box.max).multiplyScalar(0.5);
    const sphere = new THREE.Sphere(); box.getBoundingSphere(sphere);
    const prev = this.bounds;
    this.bounds = { min: box.min.clone(), max: box.max.clone(), size, center, sphereRadius: sphere.radius };
    this.fitModel(true);
    this.bounds = prev;
    this.updateBoundsForTransforms();
  }

  private updateAssemblyBox() {
    if (this.assemblyBoxHelper) { this.scene.remove(this.assemblyBoxHelper); this.assemblyBoxHelper = null; }
    if (!this.bounds || this.componentMeshes.size < 2) return;
    const box = new THREE.Box3().setFromCenterAndSize(this.bounds.center, this.bounds.size);
    this.assemblyBoxHelper = new THREE.Box3Helper(box, new THREE.Color(0xEF7F01));
    (this.assemblyBoxHelper as unknown as { material: { transparent: boolean; opacity: number } }).material.transparent = true;
    (this.assemblyBoxHelper as unknown as { material: { opacity: number } }).material.opacity = 0.25;
    this.scene.add(this.assemblyBoxHelper);
  }

  private updateSelectedBox() {
    if (this.selectedBoxHelper) { this.scene.remove(this.selectedBoxHelper); this.selectedBoxHelper = null; }
    if (!this.selectedId) return;
    const mesh = this.componentMeshes.get(this.selectedId);
    if (!mesh || !mesh.visible) return;
    const box = new THREE.Box3().setFromObject(mesh);
    if (box.isEmpty()) return;
    this.selectedBoxHelper = new THREE.Box3Helper(box, new THREE.Color(0xC5C5BD));
    this.scene.add(this.selectedBoxHelper);
  }

  onSelect(cb: (id: string | null) => void) { this.onSelectComponent = cb; }
  onTransform(cb: (id: string, t: ComponentTransform) => void) { this.onTransformChange = cb; }

  getSelectedId(): string | null { return this.selectedId; }

  setDimmed(v: boolean) {
    const apply = (m: THREE.Mesh) => {
      const mat = m.material as THREE.MeshStandardMaterial;
      mat.opacity = v ? 0.45 : 1;
      mat.transparent = v;
    };
    if (this.mesh) apply(this.mesh);
    for (const mm of this.componentMeshes.values()) apply(mm);
    if (this.triangleEdges) (this.triangleEdges.material as THREE.LineBasicMaterial).opacity = v ? 0.3 : 0.9;
    this.render();
  }

  fadeIn() {
    const targets: THREE.Mesh[] = [];
    if (this.mesh) targets.push(this.mesh);
    for (const mm of this.componentMeshes.values()) targets.push(mm);
    if (targets.length === 0) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      for (const m of targets) { const mat = m.material as THREE.MeshStandardMaterial; mat.opacity = 1; mat.transparent = false; }
      if (this.triangleEdges) (this.triangleEdges.material as THREE.LineBasicMaterial).opacity = 0.9;
      this.render(); return;
    }
    for (const m of targets) { const mat = m.material as THREE.MeshStandardMaterial; mat.transparent = true; mat.opacity = 0; }
    if (this.triangleEdges) { (this.triangleEdges.material as THREE.LineBasicMaterial).transparent = true; (this.triangleEdges.material as THREE.LineBasicMaterial).opacity = 0; }
    const t0 = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / 380);
      for (const m of targets) (m.material as THREE.MeshStandardMaterial).opacity = t;
      if (this.triangleEdges) (this.triangleEdges.material as THREE.LineBasicMaterial).opacity = t * 0.9;
      this.render();
      if (t < 1) requestAnimationFrame(step);
      else { for (const m of targets) (m.material as THREE.MeshStandardMaterial).transparent = false; if (this.triangleEdges) (this.triangleEdges.material as THREE.LineBasicMaterial).transparent = false; }
    };
    requestAnimationFrame(step);
  }

  private resize() {
    const w = this.host.clientWidth, h = this.host.clientHeight;
    if (w === 0 || h === 0) return;
    this.size = { w, h };
    this.renderer.setSize(w, h);
    this.cameraPersp.aspect = w / h;
    this.cameraPersp.updateProjectionMatrix();
    this.updateOrthoFrustum();
    this.updateClippingPlanes();
    this.render();
  }

  private render() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(() => {
      this.raf = null;
      this.renderer.render(this.scene, this.camera);
    });
  }

  getCamera(): THREE.Camera { return this.camera; }
  getControls(): OrbitControls { return this.controls; }
  getBounds() { return this.bounds; }
  onViewChangeCallback(cb: (id: ViewId)=>void) { this.onViewChange = cb; }

  private disposeInternal() {
    if (this.resizeObserver) { this.resizeObserver.disconnect(); this.resizeObserver = null; }
    if (this.onContextMenuHandler) { this.renderer.domElement.removeEventListener("contextmenu", this.onContextMenuHandler); this.onContextMenuHandler = null; }
    if (this.onDblClickHandler) { this.renderer.domElement.removeEventListener("dblclick", this.onDblClickHandler); this.onDblClickHandler = null; }
    if (this.keyHandler) { window.removeEventListener("keydown", this.keyHandler); this.keyHandler = null; }
    if (this.themeHandler) { window.removeEventListener("themechange", this.themeHandler); this.themeHandler = null; }
    this.controls.dispose();
    this.renderer.dispose();
    if (this.host.contains(this.renderer.domElement)) this.host.removeChild(this.renderer.domElement);
    if (this.transformControls) { this.scene.remove(this.transformControls as unknown as THREE.Object3D); (this.transformControls as unknown as { dispose?: () => void }).dispose?.(); this.transformControls = null; }
    if (this.assemblyBoxHelper) { this.scene.remove(this.assemblyBoxHelper); this.assemblyBoxHelper = null; }
    if (this.selectedBoxHelper) { this.scene.remove(this.selectedBoxHelper); this.selectedBoxHelper = null; }
    if (this.raf) cancelAnimationFrame(this.raf);
    if (this.mesh) { this.mesh.geometry.dispose(); (this.mesh.material as THREE.Material).dispose(); }
    if (this.triangleEdges) { this.triangleEdges.geometry.dispose(); (this.triangleEdges.material as THREE.Material).dispose(); }
    for (const mm of this.componentMeshes.values()) { mm.geometry.dispose(); (mm.material as THREE.Material).dispose(); }
    this.componentMeshes.clear();
    this.componentData.clear();
    for (const g of [this.grid, this.axes]) {
      g.traverse((obj) => {
        const o = obj as unknown as { geometry?: THREE.BufferGeometry; material?: THREE.Material; map?: THREE.Texture };
        if (o.geometry) o.geometry.dispose?.();
        if (o.material) {
          const m = o.material as unknown as { map?: THREE.Texture; dispose: () => void };
          if (m.map) m.map.dispose?.();
          m.dispose();
        }
      });
    }
  }

  dispose() {
    if ((this as unknown as { _cleanup?: () => void })._cleanup) (this as unknown as { _cleanup: () => void })._cleanup();
  }
}
