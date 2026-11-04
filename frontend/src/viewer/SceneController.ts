import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { MeshBVH, acceleratedRaycast } from "three-mesh-bvh";
import { UP_AXIS_QUATERNION_XYZW } from "@weld/core";
import { SeamLayer } from "./SeamLayer.ts";
import type { PathHit, SeamDrawItem } from "./SeamLayer.ts";
import type { UpAxis } from "@weld/core";
import { chooseEngineeringInterval, viewDirectionForId as viewDir, computeFitDistance as calcFitDistance } from "./viewMath.ts";

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export type SurfacePoint = { point: [number, number, number]; normal: [number, number, number]; snapped: "end" | "corner" | "edge" | null };

export type ViewId = "iso" | "top" | "bottom" | "front" | "back" | "left" | "right";

type ViewMode = "solid" | "wireframe" | "triangles";

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
  private lights: THREE.Object3D[] = [];
  private host: HTMLElement;
  private raf: number | null = null;
  private projection: "perspective" | "orthographic" = "perspective";
  private viewMode: ViewMode = "solid";
  private size = { w: 1, h: 1 };
  private bounds: { min: THREE.Vector3; max: THREE.Vector3; size: THREE.Vector3; center: THREE.Vector3; sphereRadius: number } | null = null;
  private partGroup = new THREE.Group();
  private gridInterval = 10;
  private cameraAnimation = 0;
  private seamLayer = new SeamLayer();
  private xray = false;
  private dimmed = false;
  private clipPlane = new THREE.Plane();
  private clipping: THREE.Plane[] = this.seamLayer.clipping;
  private cap: THREE.Mesh | null = null;
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
    this.renderer.localClippingEnabled = true;
    host.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.configureControls();

    this.grid = new THREE.Group();
    this.axes = new THREE.Group();
    this.scene.add(this.grid);
    this.scene.add(this.axes);
    this.scene.add(this.partGroup);
    this.partGroup.add(this.seamLayer.group);
    this.raycaster.firstHitOnly = true;
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
    const order: ViewMode[] = ["solid", "wireframe", "triangles"];
    const idx = order.indexOf(this.viewMode);
    this.setViewMode(order[(idx + 1) % order.length]!);
  }


  private buildGridForBounds(bounds: typeof this.bounds) {
    this.grid.clear();
    const maxDim = bounds ? Math.max(bounds.size.x, bounds.size.y, bounds.size.z) : 400;
    const interval = chooseEngineeringInterval(maxDim);
    this.gridInterval = interval;
    const rawExtent = maxDim > 0 ? maxDim * 1.6 : 400;
    const extent = Math.max(interval * 4, Math.ceil(rawExtent / interval) * interval);
    const divisions = Math.max(4, Math.min(40, Math.round(extent / interval)));
    const size = extent;
    const main = new THREE.Color(cssVar("--grid-main") || cssVar("--rev-green-t3") || "#455B32");
    const sub = new THREE.Color(cssVar("--grid-sub") || cssVar("--rev-green") || "#2B381F");
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
    const maxDim = bounds ? Math.max(bounds.size.x, bounds.size.y, bounds.size.z) : 200;
    const axisLen = Math.max(maxDim * 0.3, 1e-3);
    const helper = new THREE.AxesHelper(axisLen);
    this.axes.add(helper);
    const labels: [string, THREE.Vector3, string][] = [
      ["X", new THREE.Vector3(axisLen * 1.12, 0, 0), "#ff4d4d"],
      ["Y", new THREE.Vector3(0, axisLen * 1.12, 0), "#4dff4d"],
      ["Z", new THREE.Vector3(0, 0, axisLen * 1.12), "#4d7dff"],
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
      const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: true, depthWrite: false });
      const spr = new THREE.Sprite(mat);
      spr.position.copy(pos);
      spr.scale.set(axisLen * 0.16, axisLen * 0.08, 1);
      spr.renderOrder = 999;
      this.axes.add(spr);
      const tipGeo = new THREE.SphereGeometry(axisLen * 0.018, 8, 8);
      const tipMat = new THREE.MeshBasicMaterial({ color });
      const tip = new THREE.Mesh(tipGeo, tipMat);
      tip.position.copy(pos).multiplyScalar(1 / 1.12);
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
      const halfH = Math.max(extent * 0.55, 1e-3);
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
    if (!this.mesh) return;
    const mat = this.mesh.material as THREE.MeshStandardMaterial;
    mat.wireframe = mode === "wireframe";
    mat.needsUpdate = true;
    if (mode === "triangles") {
      if (!this.triangleEdges) {
        const geo = this.mesh.geometry as THREE.BufferGeometry;
        const edges = new THREE.EdgesGeometry(geo, 1);
        const lineMat = new THREE.LineBasicMaterial({ color: cssVar("--bright-discovery") || cssVar("--discovery") || "#E97F01", transparent: true, opacity: 0.95, linewidth: 1 });
        this.triangleEdges = new THREE.LineSegments(edges, lineMat);
        this.partGroup.add(this.triangleEdges);
      }
      this.triangleEdges.visible = true;
      mat.wireframe = false;
      mat.transparent = false;
      mat.opacity = 1;
    } else if (this.triangleEdges) {
      this.triangleEdges.visible = false;
    }
    const solidColor = cssVar("--part-solid") || (document.documentElement.getAttribute("data-theme")==="light" ? "#141E00" : "#C5C5BD");
    const wireColor = cssVar("--bright-discovery") || cssVar("--discovery") || "#E97F01";
    mat.color = new THREE.Color(mode === "wireframe" ? wireColor : solidColor);
    if (this.triangleEdges) {
      (this.triangleEdges.material as THREE.LineBasicMaterial).color = new THREE.Color(wireColor);
    }
    this.render();
  }

  setWireframe(v: boolean) {
    this.setViewMode(v ? "wireframe" : "solid");
  }

  updateTheme() {
    this.seamLayer.updateTheme();
    if (this.cap) (this.cap.material as THREE.MeshBasicMaterial).color.set(cssVar("--section-cap") || "#93938D");
    const bg = cssVar("--bg-viewport");
    if (bg) this.scene.background = new THREE.Color(bg);
    if (this.mesh) {
      this.setViewMode(this.viewMode);
    }
    this.buildGridForBounds(this.bounds);
    this.buildAxesForBounds(this.bounds);
    if (this.triangleEdges) {
      (this.triangleEdges.material as THREE.LineBasicMaterial).color = new THREE.Color(cssVar("--bright-discovery") || cssVar("--discovery") || "#E97F01");
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
    const animation = ++this.cameraAnimation;
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
      if (animation !== this.cameraAnimation) return;
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


  private handleDoubleClick(e: MouseEvent) {
    const targetEl = e.target as HTMLElement;
    if (targetEl.closest(".view-controls") || targetEl.closest(".orientation-gizmo") || targetEl.closest("button")) return;
    if (this.host.dataset.tool === "draw") return;

    if (!this.mesh) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const hits = this.raycaster.intersectObject(this.mesh, false);
    if (hits.length === 0) return;
    const hit = hits[0]!;
    const pointDisplay = hit.point.clone();
    const dir = this.camera.position.clone().sub(this.controls.target).normalize();
    const dist = this.camera.position.distanceTo(this.controls.target);
    const newTarget = pointDisplay.clone();
    const newPos = newTarget.clone().add(dir.multiplyScalar(dist));
    this.animateCamera(this.camera.position.clone(), newPos, this.controls.target.clone(), newTarget, 350);
  }


  getGridInterval(): number { return this.gridInterval; }


  // Geometry stays in file coordinates. The part group applies the unit scale and the up-axis
  // rotation, so the scene, grid and camera are always in millimetres, Z up.
  setMesh(positions: Float32Array, indices: Uint32Array) {
    this.disposePart();

    if (positions.length === 0 || indices.length === 0) {
      this.updateBounds();
      this.render();
      return;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setIndex(new THREE.BufferAttribute(indices, 1));
    geo.computeVertexNormals();
    geo.computeBoundingBox();
    geo.computeBoundingSphere();
    this.seamLayer.markerSize = geo.boundingSphere!.radius * 0.07;

    const solidColor = cssVar("--part-solid") || (document.documentElement.getAttribute("data-theme") === "light" ? "#141E00" : "#C5C5BD");
    const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(solidColor), flatShading: true, roughness: 0.85, metalness: 0.05, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 4, polygonOffsetUnits: 4 });
    mat.clippingPlanes = this.clipping;
    geo.boundsTree = new MeshBVH(geo, { indirect: true });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.raycast = acceleratedRaycast;
    this.mesh.userData.isModel = true;
    this.partGroup.add(this.mesh);

    // Inside faces drawn flat behind the section plane read as the cut surface.
    this.cap = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: new THREE.Color(cssVar("--section-cap") || "#93938D"), side: THREE.BackSide, clippingPlanes: this.clipping }));
    this.cap.raycast = () => {};
    this.cap.visible = this.clipping.length > 0;
    this.partGroup.add(this.cap);

    if (this.lights.length === 0) {
      const lightColor = cssVar("--light-sand") || "#F6F6EE";
      const hemi = new THREE.HemisphereLight(lightColor, cssVar("--dark-forest-t2") || "#0E1600", 1.1);
      const dirLight = new THREE.DirectionalLight(lightColor, 0.9);
      dirLight.position.set(1.2, -0.8, 2);
      const fill = new THREE.DirectionalLight(lightColor, 0.35);
      fill.position.set(-0.8, 1.2, 1);
      this.scene.add(hemi, dirLight, fill);
      this.lights.push(hemi, dirLight, fill);
    }

    this.updateBounds();
    this.setViewMode(this.viewMode);
    this.fitModel(false);
  }

  setPartTransform(scaleToMm: number, upAxis: UpAxis, animate = true) {
    const [x, y, z, w] = UP_AXIS_QUATERNION_XYZW[upAxis];
    const sameScale = this.partGroup.scale.x === scaleToMm;
    const sameRotation = this.partGroup.quaternion.x === x && this.partGroup.quaternion.w === w;
    if (sameScale && sameRotation) return;
    this.partGroup.scale.setScalar(scaleToMm);
    this.partGroup.quaternion.set(x, y, z, w);
    this.updateBounds();
    if (this.mesh) this.fitModel(animate);
  }

  private updateBounds() {
    this.partGroup.updateMatrixWorld(true);
    if (!this.mesh) {
      this.bounds = null;
    } else {
      const box = new THREE.Box3().setFromObject(this.mesh);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      this.bounds = { min: box.min.clone(), max: box.max.clone(), size, center, sphereRadius: Math.max(size.length() / 2, 1e-6) };
      this.controls.minDistance = this.bounds.sphereRadius * 0.02;
      this.controls.maxDistance = this.bounds.sphereRadius * 60;
    }
    this.buildGridForBounds(this.bounds);
    this.buildAxesForBounds(this.bounds);
    this.render();
  }

  private disposePart() {
    if (this.cap) { this.partGroup.remove(this.cap); (this.cap.material as THREE.Material).dispose(); this.cap = null; }
    if (this.mesh) { this.partGroup.remove(this.mesh); this.mesh.geometry.dispose(); (this.mesh.material as THREE.Material).dispose(); this.mesh = null; }
    if (this.triangleEdges) { this.partGroup.remove(this.triangleEdges); this.triangleEdges.geometry.dispose(); (this.triangleEdges.material as THREE.Material).dispose(); this.triangleEdges = null; }
  }

  clearMesh() {
    this.disposePart();
    this.updateBounds();
  }

  setDimmed(v: boolean) {
    this.dimmed = v;
    this.applyOpacity();
  }

  setXray(on: boolean) {
    this.xray = on;
    this.seamLayer.setXray(on);
    if (this.cap) this.cap.visible = this.clipping.length > 0 && !on;
    this.applyOpacity();
  }

  private applyOpacity() {
    if (!this.mesh) return;
    const mat = this.mesh.material as THREE.MeshStandardMaterial;
    mat.opacity = this.dimmed ? 0.45 : this.xray ? 0.2 : 1;
    mat.transparent = mat.opacity < 1;
    mat.depthWrite = !this.xray;
    mat.needsUpdate = true;
    if (this.triangleEdges) (this.triangleEdges.material as THREE.LineBasicMaterial).opacity = this.dimmed ? 0.3 : 0.9;
    this.render();
  }

  // Cuts the part at `offset` (0..1 of the part's extent) along a world axis. Keeps the lower side,
  // or the upper side when flipped. Seams on the removed side are hidden and cannot be picked.
  setSection(section: { axis: "x" | "y" | "z"; offset: number; flipped: boolean } | null) {
    this.clipping.length = 0;
    if (section && this.bounds) {
      const k = "xyz".indexOf(section.axis);
      const at = this.bounds.min.getComponent(k) + this.bounds.size.getComponent(k) * section.offset;
      const sign = section.flipped ? 1 : -1;
      const normal = new THREE.Vector3().setComponent(k, sign);
      this.clipPlane.set(normal, -sign * at);
      this.clipping.push(this.clipPlane);
    }
    if (this.cap) this.cap.visible = this.clipping.length > 0 && !this.xray;
    this.render();
  }

  setIndices(indices: Uint32Array) {
    if (!this.mesh) return;
    const geo = this.mesh.geometry as THREE.BufferGeometry;
    geo.setIndex(new THREE.BufferAttribute(indices, 1));
    geo.boundsTree = new MeshBVH(geo, { indirect: true });
    if (this.triangleEdges) { this.partGroup.remove(this.triangleEdges); this.triangleEdges.geometry.dispose(); (this.triangleEdges.material as THREE.Material).dispose(); this.triangleEdges = null; }
    this.setViewMode(this.viewMode);
  }

  setSeams(items: SeamDrawItem[]) {
    this.seamLayer.setSeams(items);
    this.render();
  }

  setSeamHighlight(selectedId: string | null, hoverId: string | null) {
    this.seamLayer.setHighlight(selectedId, hoverId);
    this.render();
  }

  toPart(world: THREE.Vector3): [number, number, number] {
    const v = this.partGroup.worldToLocal(world.clone());
    return [v.x, v.y, v.z];
  }

  setSnapMarker(point: [number, number, number] | null, kind?: "end" | "corner" | "edge" | "surface" | "split") {
    this.seamLayer.setSnapMarker(point ? new THREE.Vector3(...point) : null, kind);
    this.render();
  }

  // First surface hit on the side of the section that is still shown.
  private visibleHit(): THREE.Intersection | undefined {
    if (!this.mesh) return undefined;
    return this.raycaster.intersectObject(this.mesh, false).find((h) => this.clipping.every((plane) => plane.distanceToPoint(h.point) >= 0));
  }

  setSeamPreview(points: Float32Array | null, closed = false) {
    this.seamLayer.setPreview(points, closed);
    this.render();
  }

  // Nearest drawn seam under the cursor, ignoring seams hidden behind the part (unless X-ray is on).
  pickSeam(event: { clientX: number; clientY: number }): string | null {
    const items = this.seamLayer.drawn;
    const hit = this.pickPath(items, event);
    return hit ? items[hit.index]!.id : null;
  }

  private projectionCache = new WeakMap<object, { key: string; screens: Float32Array[] }>();

  pickPath(paths: { points: Float32Array; closed: boolean }[], event: { clientX: number; clientY: number }, maxPixels = 8): PathHit | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const key = [...this.camera.matrixWorld.elements, ...this.camera.projectionMatrix.elements, ...this.partGroup.matrixWorld.elements, rect.width, rect.height].join(",");
    let cached = this.projectionCache.get(paths);
    if (!cached || cached.key !== key) {
      cached = { key, screens: SeamLayer.project(paths, this.partGroup.matrixWorld, this.camera, { w: rect.width, h: rect.height }) };
      this.projectionCache.set(paths, cached);
    }
    const hits = SeamLayer.pick(paths, cached.screens, this.partGroup.matrixWorld, event.clientX - rect.left, event.clientY - rect.top, maxPixels)
      .filter((hit) => this.clipping.every((plane) => plane.distanceToPoint(hit.world) >= 0));
    if (this.xray || !this.mesh) return hits[0] ?? null;
    const slack = (this.bounds?.sphereRadius ?? 1) * 0.005;
    // Nearest visible one: cast toward each seam point (not through the cursor beside it) and skip hidden ones.
    return hits.find((hit) => {
      const ndc = hit.world.clone().project(this.camera);
      this.raycaster.setFromCamera(new THREE.Vector2(ndc.x, ndc.y), this.camera);
      const surface = this.visibleHit();
      return !surface || this.raycaster.ray.origin.distanceTo(hit.world) <= surface.distance + slack;
    }) ?? null;
  }

  // Point on the visible surface in part (file) coordinates with its outward normal, snapped like CAD:
  // the end of an existing seam first (so seams connect), then a mesh corner, then a part edge.
  surfacePoint(event: { clientX: number; clientY: number }, snap: { ends?: [number, number, number][]; edges?: { points: Float32Array; closed: boolean }[] } = {}): SurfacePoint | null {
    if (!this.mesh) return null;
    this.setRayFromEvent(event);
    const hit = this.visibleHit();
    if (!hit || !hit.face) return null;

    const pos = (this.mesh.geometry as THREE.BufferGeometry).getAttribute("position") as THREE.BufferAttribute;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const pixels = (v: THREE.Vector3) => {
      const p = v.clone().applyMatrix4(this.partGroup.matrixWorld).project(this.camera);
      return Math.hypot((p.x + 1) / 2 * rect.width + rect.left - event.clientX, (1 - p.y) / 2 * rect.height + rect.top - event.clientY);
    };
    const n = hit.face.normal;
    const at = (v: THREE.Vector3, snapped: SurfacePoint["snapped"]): SurfacePoint => ({ point: [v.x, v.y, v.z], normal: [n.x, n.y, n.z], snapped });

    let best: { v: THREE.Vector3; d: number } | null = null;
    for (const e of snap.ends ?? []) {
      const v = new THREE.Vector3(...e);
      const d = pixels(v);
      if (d <= 14 && (!best || d < best.d)) best = { v, d };
    }
    if (best) return at(best.v, "end");

    for (const i of [hit.face.a, hit.face.b, hit.face.c]) {
      const v = new THREE.Vector3().fromBufferAttribute(pos, i);
      if (pixels(v) <= 10) return at(v, "corner");
    }

    if (snap.edges?.length) {
      const edge = this.pickPath(snap.edges, event, 8);
      if (edge) return at(this.partGroup.worldToLocal(edge.world.clone()), "edge");
    }

    return at(this.partGroup.worldToLocal(hit.point.clone()), null);
  }

  private setRayFromEvent(event: { clientX: number; clientY: number }) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.mouse, this.camera);
  }

  fadeIn() {
    if (!this.mesh) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      this.applyOpacity();
      return;
    }
    const mat = this.mesh.material as THREE.MeshStandardMaterial;
    mat.transparent = true; mat.opacity = 0;
    if (this.triangleEdges) { (this.triangleEdges.material as THREE.LineBasicMaterial).transparent = true; (this.triangleEdges.material as THREE.LineBasicMaterial).opacity = 0; }
    const t0 = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / 380);
      mat.opacity = t;
      if (this.triangleEdges) (this.triangleEdges.material as THREE.LineBasicMaterial).opacity = t * 0.9;
      this.render();
      if (t < 1) requestAnimationFrame(step);
      else { if (this.triangleEdges) (this.triangleEdges.material as THREE.LineBasicMaterial).transparent = false; this.applyOpacity(); }
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
    if (this.raf) cancelAnimationFrame(this.raf);
    if (this.mesh) { this.mesh.geometry.dispose(); (this.mesh.material as THREE.Material).dispose(); }
    if (this.triangleEdges) { this.triangleEdges.geometry.dispose(); (this.triangleEdges.material as THREE.Material).dispose(); }
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

  sectionInPartSpace(): { normal: [number, number, number]; constant: number } | null {
    if (this.clipping.length === 0) return null;
    this.partGroup.updateMatrixWorld();
    const plane = this.clipPlane.clone().applyMatrix4(this.partGroup.matrixWorld.clone().invert());
    return { normal: plane.normal.toArray() as [number, number, number], constant: plane.constant };
  }

  dispose() {
    if ((this as unknown as { _cleanup?: () => void })._cleanup) (this as unknown as { _cleanup: () => void })._cleanup();
  }
}
