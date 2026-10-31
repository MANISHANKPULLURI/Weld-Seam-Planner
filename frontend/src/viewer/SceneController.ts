import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export type ViewId = "iso" | "top" | "front" | "right";

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
  private lights: THREE.Object3D[] = [];
  private host: HTMLElement;
  private raf: number | null = null;
  private projection: "perspective" | "orthographic" = "perspective";
  private wireframe = false;
  private size = { w: 1, h: 1 };
  private bounds: { min: THREE.Vector3; max: THREE.Vector3; size: THREE.Vector3 } | null = null;
  private lastGrid = { size: 400, divisions: 40 };

  constructor(host: HTMLElement) {
    this.host = host;
    this.scene = new THREE.Scene();
    const bg = cssVar("--bg-viewport");
    if (bg) this.scene.background = new THREE.Color(bg);
    this.scene.up.set(0, 0, 1);

    this.cameraPersp = new THREE.PerspectiveCamera(50, 1, 0.1, 10000);
    this.cameraPersp.position.set(150, 120, 150);
    this.cameraPersp.up.set(0, 0, 1);
    this.cameraOrtho = new THREE.OrthographicCamera(-100, 100, 100, -100, 0.1, 10000);
    this.cameraOrtho.position.copy(this.cameraPersp.position);
    this.cameraOrtho.up.set(0, 0, 1);
    this.camera = this.cameraPersp;

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.domElement.style.display = "block";
    this.renderer.domElement.style.width = "100%";
    this.renderer.domElement.style.height = "100%";
    host.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = false;
    this.controls.addEventListener("change", () => this.render());

    this.grid = new THREE.Group();
    this.axes = new THREE.Group();
    this.scene.add(this.grid);
    this.scene.add(this.axes);
    this.buildGrid(400, 40);
    this.buildAxes();

    const ro = new ResizeObserver(() => this.resize());
    ro.observe(host);
    requestAnimationFrame(() => this.resize());
    this.render();

    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
      if (e.key.toLowerCase() === "r") this.resetView();
      if (e.key.toLowerCase() === "w") this.setWireframe(!this.wireframe);
    };
    window.addEventListener("keydown", onKey);
    (this as unknown as { _cleanup: () => void })._cleanup = () => {
      window.removeEventListener("keydown", onKey);
      ro.disconnect();
    };
  }

  private buildGrid(size: number, divisions: number) {
    this.grid.clear();
    this.lastGrid = { size, divisions };
    const main = new THREE.Color(cssVar("--grid-main") || cssVar("--rev-green-t3"));
    const sub = new THREE.Color(cssVar("--grid-sub") || cssVar("--rev-green"));
    const g1 = new THREE.GridHelper(size, divisions, main, sub);
    g1.rotation.x = Math.PI / 2;
    this.grid.add(g1);
  }

  private buildAxes() {
    this.axes.clear();
    const helper = new THREE.AxesHelper(60);
    this.axes.add(helper);
    const labels: [string, THREE.Vector3][] = [
      ["X", new THREE.Vector3(62, 0, 0)],
      ["Y", new THREE.Vector3(0, 62, 0)],
      ["Z", new THREE.Vector3(0, 0, 62)],
    ];
    for (const [text, pos] of labels) {
      const canvas = document.createElement("canvas");
      canvas.width = 64; canvas.height = 32;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = cssVar("--text-secondary");
      ctx.font = "14px '42dot Sans', system-ui, sans-serif";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(text, 32, 16);
      const tex = new THREE.CanvasTexture(canvas);
      const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
      const spr = new THREE.Sprite(mat);
      spr.position.copy(pos);
      spr.scale.set(12, 6, 1);
      this.axes.add(spr);
    }
  }

  setProjection(p: "perspective" | "orthographic") {
    if (this.projection === p) return;
    this.projection = p;
    const old = this.camera;
    this.camera = p === "perspective" ? this.cameraPersp : this.cameraOrtho;
    this.camera.position.copy(old.position);
    this.camera.quaternion.copy(old.quaternion);
    this.controls.object = this.camera;
    this.controls.update();
    this.resize();
    this.render();
  }

  setWireframe(v: boolean) {
    this.wireframe = v;
    if (this.mesh) {
      const mat = this.mesh.material as THREE.MeshStandardMaterial;
      mat.wireframe = v;
      mat.color = new THREE.Color(cssVar(v ? "--part-wire" : "--part-solid"));
    }
    this.render();
  }

  updateTheme() {
    const bg = cssVar("--bg-viewport");
    if (bg) this.scene.background = new THREE.Color(bg);
    if (this.mesh) {
      const mat = this.mesh.material as THREE.MeshStandardMaterial;
      mat.color = new THREE.Color(cssVar(this.wireframe ? "--part-wire" : "--part-solid"));
    }
    this.buildGrid(this.lastGrid.size, this.lastGrid.divisions);
    if (this.bounds) {
      const center = new THREE.Vector3().addVectors(this.bounds.min, this.bounds.max).multiplyScalar(0.5);
      this.grid.position.set(center.x, center.y, this.bounds.min.z);
    }
    this.render();
  }

  setView(id: ViewId) { this.animateToView(id); }

  resetView() { this.frame(); }

  private animateToView(id: ViewId) {
    const center = this.bounds ? new THREE.Vector3().addVectors(this.bounds.min, this.bounds.max).multiplyScalar(0.5) : new THREE.Vector3(0, 0, 0);
    const d = this.bounds ? Math.max(this.bounds.size.x, this.bounds.size.y, this.bounds.size.z) * 1.2 + 80 : 200;
    const offset = new THREE.Vector3();
    if (id === "iso") offset.set(d * 0.7, d * 0.6, d * 0.7);
    else if (id === "top") offset.set(0, 0, d);
    else if (id === "front") offset.set(0, -d, 0);
    else offset.set(d, 0, 0);
    const target = center.clone().add(offset);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      this.camera.position.copy(target);
      this.controls.target.copy(center);
      this.controls.update();
      this.render();
      return;
    }
    const start = this.camera.position.clone();
    const startTarget = this.controls.target.clone();
    const duration = 400;
    const t0 = performance.now();
    const ease = (t: number) => 1 - Math.pow(1 - t, 3);
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / duration);
      const e = ease(t);
      this.camera.position.lerpVectors(start, target, e);
      this.controls.target.lerpVectors(startTarget, center, e);
      this.controls.update();
      this.render();
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  setMesh(positions: Float32Array, indices: Uint32Array) {
    if (this.mesh) { this.scene.remove(this.mesh); this.mesh.geometry.dispose(); (this.mesh.material as THREE.Material).dispose(); this.mesh = null; }
    for (const l of this.lights) this.scene.remove(l);
    this.lights = [];
    const tmp = new THREE.BufferGeometry();
    tmp.setAttribute("position", new THREE.BufferAttribute(positions.slice(), 3));
    tmp.computeBoundingBox();
    const rawBox = tmp.boundingBox!;
    const rawSize = new THREE.Vector3().subVectors(rawBox.max, rawBox.min);
    const rawMax = Math.max(rawSize.x, rawSize.y, rawSize.z) || 1;
    const target = 120;
    const scale = rawMax < 0.1 ? 1 : rawMax > 500 || rawMax < 20 ? target / rawMax : 1;
    const scaled = new Float32Array(positions.length);
    for (let i = 0; i < positions.length; i += 3) {
      scaled[i] = positions[i] * scale;
      scaled[i + 1] = positions[i + 1] * scale;
      scaled[i + 2] = positions[i + 2] * scale;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(scaled, 3));
    geo.setIndex(new THREE.BufferAttribute(indices, 1));
    geo.computeVertexNormals();
    geo.computeBoundingBox();
    const box = geo.boundingBox!;
    this.bounds = { min: box.min.clone(), max: box.max.clone(), size: new THREE.Vector3().subVectors(box.max, box.min) };
    const color = new THREE.Color(cssVar(this.wireframe ? "--part-wire" : "--part-solid"));
    const mat = new THREE.MeshStandardMaterial({ color, flatShading: true, wireframe: this.wireframe });
    this.mesh = new THREE.Mesh(geo, mat);
    const lightColor = cssVar("--light-sand");
    const hemi = new THREE.HemisphereLight(lightColor, cssVar("--dark-forest-t2"), 1.2);
    const dir = new THREE.DirectionalLight(lightColor, 0.8);
    dir.position.set(100, 100, 200);
    this.scene.add(hemi); this.scene.add(dir);
    this.lights.push(hemi, dir);
    this.scene.add(this.mesh);
    const center = new THREE.Vector3().addVectors(box.min, box.max).multiplyScalar(0.5);
    this.axes.position.copy(box.min);
    this.grid.position.set(center.x, center.y, box.min.z);
    const maxDim = Math.max(this.bounds.size.x, this.bounds.size.y, this.bounds.size.z);
    const gridSize = Math.max(160, Math.ceil((maxDim * 1.6) / 10) * 10);
    const divisions = Math.max(16, Math.round(gridSize / 10));
    this.buildGrid(gridSize, divisions);
    this.grid.position.set(center.x, center.y, box.min.z);
    this.frame(true);
  }

  clearMesh() {
    if (this.mesh) { this.scene.remove(this.mesh); this.mesh.geometry.dispose(); (this.mesh.material as THREE.Material).dispose(); this.mesh = null; }
    for (const l of this.lights) this.scene.remove(l);
    this.lights = [];
    this.bounds = null;
    this.buildGrid(400, 40);
    this.grid.position.set(0, 0, 0);
    this.axes.position.set(0, 0, 0);
    this.render();
  }

  setDimmed(v: boolean) {
    if (!this.mesh) return;
    const mat = this.mesh.material as THREE.MeshStandardMaterial;
    mat.opacity = v ? 0.4 : 1;
    mat.transparent = v;
    this.render();
  }

  fadeIn() {
    if (!this.mesh) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const mat = this.mesh.material as THREE.MeshStandardMaterial;
      mat.opacity = 1;
      mat.transparent = false;
      this.render();
      return;
    }
    const mat = this.mesh.material as THREE.MeshStandardMaterial;
    mat.transparent = true;
    mat.opacity = 0;
    const t0 = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / 400);
      mat.opacity = t;
      this.render();
      if (t < 1) requestAnimationFrame(step);
      else mat.transparent = false;
    };
    requestAnimationFrame(step);
  }

  private frame(animate = false) {
    if (!this.bounds) {
      this.camera.position.set(150, 120, 150);
      this.controls.target.set(0, 0, 0);
      this.controls.update();
      this.render();
      return;
    }
    const center = new THREE.Vector3().addVectors(this.bounds.min, this.bounds.max).multiplyScalar(0.5);
    const size = this.bounds.size.length();
    const dist = size * 0.9 + 80;
    const dir = new THREE.Vector3(0.7, 0.6, 0.7).normalize();
    const targetPos = center.clone().add(dir.multiplyScalar(dist));
    if (animate && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const start = this.camera.position.clone();
      const startTarget = this.controls.target.clone();
      const t0 = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, (now - t0) / 500);
        const e = 1 - Math.pow(1 - t, 3);
        this.camera.position.lerpVectors(start, targetPos, e);
        this.controls.target.lerpVectors(startTarget, center, e);
        this.controls.update();
        this.render();
        if (t < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    } else {
      this.camera.position.copy(targetPos);
      this.controls.target.copy(center);
      this.controls.update();
      this.render();
    }
    this.updateOrtho();
  }

  private updateOrtho() {
    if (this.projection !== "orthographic") return;
    const aspect = this.size.w / Math.max(1, this.size.h);
    const frustum = 200;
    this.cameraOrtho.left = -frustum * aspect;
    this.cameraOrtho.right = frustum * aspect;
    this.cameraOrtho.top = frustum;
    this.cameraOrtho.bottom = -frustum;
    this.cameraOrtho.updateProjectionMatrix();
  }

  private resize() {
    const w = this.host.clientWidth, h = this.host.clientHeight;
    if (w === 0 || h === 0) return;
    this.size = { w, h };
    this.renderer.setSize(w, h);
    this.cameraPersp.aspect = w / h;
    this.cameraPersp.updateProjectionMatrix();
    this.updateOrtho();
    this.render();
  }

  private render() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(() => {
      this.raf = null;
      this.renderer.render(this.scene, this.camera);
    });
  }

  dispose() {
    if ((this as unknown as { _cleanup?: () => void })._cleanup) (this as unknown as { _cleanup: () => void })._cleanup();
    this.controls.dispose();
    this.renderer.dispose();
    if (this.host.contains(this.renderer.domElement)) this.host.removeChild(this.renderer.domElement);
  }
}
