import * as THREE from "three";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";

export type SeamDrawItem = { id: string; points: Float32Array; closed: boolean; status: "candidate" | "accepted"; color?: string };

export type PathHit = { index: number; segment: number; t: number; pixels: number; world: THREE.Vector3 };

function cssVar(name: string, fallback: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

// A round badge with a number, always facing the camera at a fixed pixel size.
function numberSprite(text: string, color: string): THREE.Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(32, 32, 30, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#0E1600";
  ctx.font = `bold ${text.length > 2 ? 24 : 32}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 32, 34);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), depthTest: false, sizeAttenuation: false }));
  sprite.scale.set(0.026, 0.026, 1);
  return sprite;
}

// A name tag (e.g. "S5") in the seam's colour, fixed pixel size.
function textSprite(text: string, color: string): THREE.Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 128; canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "rgba(14, 22, 0, 0.85)";
  ctx.beginPath();
  ctx.roundRect(4, 8, 120, 48, 12);
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.font = "bold 30px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 64, 34);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), depthTest: false, sizeAttenuation: false }));
  sprite.scale.set(0.06, 0.03, 1);
  return sprite;
}

function segmentPositions(points: Float32Array, closed: boolean): Float32Array {
  const n = points.length / 3;
  const segments = closed ? n : n - 1;
  const out = new Float32Array(Math.max(0, segments) * 6);
  for (let i = 0; i < segments; i++) {
    const j = (i + 1) % n;
    out.set(points.subarray(i * 3, i * 3 + 3), i * 6);
    out.set(points.subarray(j * 3, j * 3 + 3), i * 6 + 3);
  }
  return out;
}

// Seam overlays live in the part group, so they share the part's unit scale and up-axis rotation.
// shortcut: one draw call per seam; batch candidates into one LineSegments2 if parts with
// thousands of candidates feel slow.
export class SeamLayer {
  readonly group = new THREE.Group();
  private lines = new Map<string, LineSegments2>();
  private items: SeamDrawItem[] = [];
  private preview: LineSegments2 | null = null;
  private selectedId: string | null = null;
  private hoverId: string | null = null;
  private xray = false;
  // Shared with the part's section plane, so seams on the cut-away side are hidden too.
  clipping: THREE.Plane[] = [];
  // Arrowhead size in part units, set from the part's size.
  markerSize = 1;
  private markers = new THREE.Group();
  private ends: THREE.InstancedMesh | null = null;
  private snap: THREE.Mesh | null = null;
  private splitGroup = new THREE.Group();
  private sequenceGroup = new THREE.Group();
  private flowGroup = new THREE.Group();
  private flow: { cumulative: number[]; points: Float32Array; closed: boolean; phase: number } | null = null;
  private flowKey: object | null = null;
  private flash: { ids: Set<string>; t: number } | null = null;
  private flowSeconds = 0;
  private labelGroup = new THREE.Group();
  private simGroup = new THREE.Group();
  private simTorch: THREE.Group | null = null;
  private simDone = new Map<number, LineSegments2>();
  private simPartial: LineSegments2 | null = null;

  constructor() {
    this.group.add(this.markers);
    this.group.add(this.splitGroup);
    this.group.add(this.sequenceGroup);
    this.group.add(this.flowGroup);
    this.group.add(this.labelGroup);
    this.group.add(this.simGroup);
  }

  setSeams(items: SeamDrawItem[]) {
    for (const line of this.lines.values()) this.disposeLine(line);
    this.lines.clear();
    this.items = items;
    for (const item of items) {
      if (item.points.length < 6) continue;
      const line = this.makeLine(item.points, item.closed);
      line.userData.id = item.id;
      this.lines.set(item.id, line);
      this.group.add(line);
    }
    this.updateEnds();
    this.restyle();
  }

  // Dots at both ends of every accepted seam: where seams join, and where a split cut one in two.
  private updateEnds() {
    if (this.ends) { this.group.remove(this.ends); this.ends.geometry.dispose(); (this.ends.material as THREE.Material).dispose(); this.ends = null; }
    const open = this.items.filter((x) => x.status === "accepted" && !x.closed && x.points.length >= 6);
    if (open.length === 0) return;
    const r = this.markerSize * 0.18;
    this.ends = new THREE.InstancedMesh(new THREE.SphereGeometry(r, 12, 8), new THREE.MeshBasicMaterial({ color: cssVar("--seam-accepted", "#628047"), clippingPlanes: this.clipping }), open.length * 2);
    const m = new THREE.Matrix4();
    open.forEach((x, i) => {
      const n = x.points.length / 3;
      let len = 0;
      for (let k = 1; k < n; k++) len += Math.hypot(x.points[k * 3]! - x.points[k * 3 - 3]!, x.points[k * 3 + 1]! - x.points[k * 3 - 2]!, x.points[k * 3 + 2]! - x.points[k * 3 - 1]!);
      const s = Math.min(1, (len * 0.05) / r);
      const at = (k: number) => m.compose(new THREE.Vector3(x.points[k * 3]!, x.points[k * 3 + 1]!, x.points[k * 3 + 2]!), new THREE.Quaternion(), new THREE.Vector3(s, s, s));
      this.ends!.setMatrixAt(i * 2, at(0));
      this.ends!.setMatrixAt(i * 2 + 1, at(n - 1));
    });
    this.ends.renderOrder = 13;
    this.group.add(this.ends);
  }

  // Welding order on the part: a numbered badge at each seam's start, an arrow at its end, and a
  // dashed line for the air move to the next seam.
  setSequence(items: { points: Float32Array; closed: boolean }[] | null) {
    for (const child of [...this.sequenceGroup.children]) {
      this.sequenceGroup.remove(child);
      const m = child as THREE.Mesh;
      m.geometry.dispose();
      const mat = m.material as THREE.Material & { map?: THREE.Texture };
      mat.map?.dispose();
      mat.dispose();
    }
    if (!items) return;
    const accent = cssVar("--accent", "#E97F01");
    const size = this.markerSize;
    const ends: { start: THREE.Vector3; end: THREE.Vector3 }[] = [];

    items.forEach((item, i) => {
      const p = item.points, n = p.length / 3;
      if (n < 2) return;
      const start = new THREE.Vector3().fromArray(p, 0);
      const end = new THREE.Vector3().fromArray(p, item.closed ? 0 : (n - 1) * 3);
      const before = new THREE.Vector3().fromArray(p, item.closed ? (n - 1) * 3 : (n - 2) * 3);
      ends.push({ start, end });

      let len = 0;
      for (let k = 1; k < n; k++) len += Math.hypot(p[k * 3]! - p[k * 3 - 3]!, p[k * 3 + 1]! - p[k * 3 - 2]!, p[k * 3 + 2]! - p[k * 3 - 1]!);
      const s = Math.min(size * 0.45, len * 0.12);
      const cone = new THREE.Mesh(new THREE.ConeGeometry(s * 0.35, s, 12), new THREE.MeshBasicMaterial({ color: accent, depthTest: false, clippingPlanes: this.clipping }));
      cone.position.copy(end);
      cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.clone().sub(before).normalize());
      cone.translateY(-s * 0.5);
      cone.renderOrder = 28;
      this.sequenceGroup.add(cone);

      const label = numberSprite(String(i + 1), accent);
      label.position.copy(start);
      label.renderOrder = 33;
      this.sequenceGroup.add(label);
    });

    for (let i = 1; i < ends.length; i++) {
      const line = new LineSegments2(new LineSegmentsGeometry().setPositions([...ends[i - 1]!.end.toArray(), ...ends[i]!.start.toArray()]), new LineMaterial({ color: cssVar("--text-muted", "#93938D"), linewidth: 1.5, dashed: true, dashSize: 4, gapSize: 4, worldUnits: false, depthTest: false, transparent: true, opacity: 0.8 }));
      line.computeLineDistances();
      line.renderOrder = 26;
      this.sequenceGroup.add(line);
    }
  }

  // Weld simulation: a torch at the pose, finished seams glowing, the current seam glowing up to the torch.
  setSimFrame(pose: { point: [number, number, number]; axis: [number, number, number]; welding: boolean } | null, done: { key: number; points: Float32Array; closed: boolean }[], partial: Float32Array | null) {
    if (!pose) { this.clearSim(); return; }
    const hot = cssVar("--discovery-t4", "#E9B475");
    if (!this.simTorch) {
      const size = this.markerSize * 0.7;
      this.simTorch = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CylinderGeometry(size * 0.18, size * 0.28, size * 1.6, 16), new THREE.MeshBasicMaterial({ color: cssVar("--light-sand-s3", "#ABABA5"), depthTest: false }));
      body.position.y = size * 1.15;
      const nozzle = new THREE.Mesh(new THREE.ConeGeometry(size * 0.18, size * 0.35, 16), new THREE.MeshBasicMaterial({ color: cssVar("--accent", "#E97F01"), depthTest: false }));
      nozzle.position.y = size * 0.18;
      nozzle.rotation.x = Math.PI;
      const arc = new THREE.Mesh(new THREE.SphereGeometry(size * 0.16, 16, 12), new THREE.MeshBasicMaterial({ color: "#FFF4C2", depthTest: false }));
      arc.name = "arc";
      for (const m of [body, nozzle, arc]) { m.renderOrder = 40; this.simTorch.add(m); }
      this.simGroup.add(this.simTorch);
    }
    this.simTorch.position.set(...pose.point);
    // Torch points along -axis (from the torch into the weld): local +y is "up the torch".
    this.simTorch.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...pose.axis).negate());
    const arc = this.simTorch.getObjectByName("arc")!;
    arc.visible = pose.welding;
    arc.scale.setScalar(pose.welding ? 0.8 + Math.random() * 0.5 : 1);

    for (const d of done) {
      if (this.simDone.has(d.key) || d.points.length < 6) continue;
      const line = this.makeLine(d.points, d.closed);
      line.material.color.set(hot); line.material.linewidth = 5; line.material.depthTest = false; line.renderOrder = 27;
      this.simDone.set(d.key, line);
      this.simGroup.add(line);
    }
    for (const [key, line] of this.simDone) {
      if (!done.some((d) => d.key === key)) { this.simGroup.remove(line); line.geometry.dispose(); line.material.dispose(); this.simDone.delete(key); }
    }
    if (this.simPartial) { this.simGroup.remove(this.simPartial); this.simPartial.geometry.dispose(); this.simPartial.material.dispose(); this.simPartial = null; }
    if (partial && partial.length >= 6) {
      this.simPartial = this.makeLine(partial, false);
      this.simPartial.material.color.set(hot); this.simPartial.material.linewidth = 6; this.simPartial.material.depthTest = false; this.simPartial.renderOrder = 27;
      this.simGroup.add(this.simPartial);
    }
  }

  private clearSim() {
    for (const child of [...this.simGroup.children]) this.simGroup.remove(child);
    this.simTorch?.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.geometry.dispose(); (m.material as THREE.Material).dispose(); } });
    for (const line of this.simDone.values()) { line.geometry.dispose(); line.material.dispose(); }
    if (this.simPartial) { this.simPartial.geometry.dispose(); this.simPartial.material.dispose(); }
    this.simTorch = null; this.simDone.clear(); this.simPartial = null;
  }

  // Split preview: alternate pieces in a second colour, a ring-like dot at every cut.
  setSplitPreview(pieces: { points: Float32Array; closed: boolean }[], cuts: THREE.Vector3[]) {
    for (const child of [...this.splitGroup.children]) {
      this.splitGroup.remove(child);
      const m = child as THREE.Mesh;
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    }
    pieces.forEach((piece, i) => {
      if (i % 2 === 0 || piece.points.length < 6) return;
      const line = this.makeLine(piece.points, piece.closed);
      line.material.color.set(cssVar("--light-sand", "#F6F6EE"));
      line.material.linewidth = 6;
      line.material.depthTest = false;
      line.renderOrder = 25;
      this.splitGroup.add(line);
    });
    for (const at of cuts) {
      const dot = new THREE.Mesh(new THREE.SphereGeometry(this.markerSize * 0.3, 16, 12), new THREE.MeshBasicMaterial({ color: cssVar("--accent", "#E97F01"), depthTest: false }));
      dot.position.copy(at);
      dot.renderOrder = 32;
      this.splitGroup.add(dot);
    }
  }

  // A marker under the cursor: where Draw will put the next point, or where Split will cut.
  setSnapMarker(point: THREE.Vector3 | null, kind: "end" | "corner" | "edge" | "surface" | "split" = "surface") {
    if (this.snap) { this.group.remove(this.snap); this.snap.geometry.dispose(); (this.snap.material as THREE.Material).dispose(); this.snap = null; }
    if (!point) return;
    const big = kind === "end" || kind === "split";
    const color = kind === "surface" ? cssVar("--text-muted", "#93938D") : cssVar("--accent", "#E97F01");
    this.snap = new THREE.Mesh(new THREE.SphereGeometry(this.markerSize * (big ? 0.28 : 0.2), 16, 12), new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: true, opacity: kind === "surface" ? 0.7 : 1 }));
    this.snap.position.copy(point);
    this.snap.renderOrder = 31;
    this.group.add(this.snap);
  }

  setHighlight(selectedId: string | null, hoverId: string | null) {
    this.selectedId = selectedId;
    this.hoverId = hoverId;
    this.restyle();
  }

  setXray(on: boolean) {
    this.xray = on;
    this.restyle();
  }

  setPreview(points: Float32Array | null, closed = false) {
    if (this.preview) { this.disposeLine(this.preview); this.preview = null; }
    if (!points || points.length < 6) return;
    this.preview = this.makeLine(points, closed);
    const m = this.preview.material;
    m.color.set(cssVar("--discovery-t3", "#E99E46"));
    m.linewidth = 4;
    m.depthTest = false;
    this.preview.renderOrder = 20;
    this.group.add(this.preview);
  }

  updateTheme() {
    this.restyle();
  }

  // Screen positions (x, y, depth) of every path point; reused until the camera or paths change.
  static project(paths: { points: Float32Array }[], partMatrix: THREE.Matrix4, camera: THREE.Camera, size: { w: number; h: number }): Float32Array[] {
    const m = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).multiply(partMatrix);
    const e = m.elements;
    return paths.map(({ points }) => {
      const out = new Float32Array(points.length);
      for (let i = 0; i < points.length; i += 3) {
        const x = points[i]!, y = points[i + 1]!, z = points[i + 2]!;
        const w = e[3]! * x + e[7]! * y + e[11]! * z + e[15]!;
        out[i] = ((e[0]! * x + e[4]! * y + e[8]! * z + e[12]!) / w + 1) / 2 * size.w;
        out[i + 1] = (1 - (e[1]! * x + e[5]! * y + e[9]! * z + e[13]!) / w) / 2 * size.h;
        out[i + 2] = (e[2]! * x + e[6]! * y + e[10]! * z + e[14]!) / w;
      }
      return out;
    });
  }

  // Paths within `maxPixels` of the cursor, nearest first, one hit per path (world = part-space point on the path).
  static pick(paths: { points: Float32Array; closed: boolean }[], screens: Float32Array[], partMatrix: THREE.Matrix4, px: number, py: number, maxPixels: number): PathHit[] {
    const hits: PathHit[] = [];
    paths.forEach((path, index) => {
      const s = screens[index]!;
      const n = s.length / 3;
      const segments = path.closed ? n : n - 1;
      let best: { segment: number; t: number; d: number } | null = null;
      for (let i = 0; i < segments; i++) {
        const j = (i + 1) % n;
        if (s[i * 3 + 2]! > 1 || s[j * 3 + 2]! > 1) continue;
        const ax = s[i * 3]!, ay = s[i * 3 + 1]!, dx = s[j * 3]! - ax, dy = s[j * 3 + 1]! - ay;
        const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
        const d = Math.hypot(ax + dx * t - px, ay + dy * t - py);
        if (d <= maxPixels && (!best || d < best.d)) best = { segment: i, t, d };
      }
      if (!best) return;
      const j = (best.segment + 1) % n;
      const world = new THREE.Vector3().fromArray(path.points, best.segment * 3).lerp(new THREE.Vector3().fromArray(path.points, j * 3), best.t).applyMatrix4(partMatrix);
      hits.push({ index, segment: best.segment, t: best.t, pixels: best.d, world });
    });
    return hits.sort((p, q) => p.pixels - q.pixels);
  }

  get drawn(): SeamDrawItem[] {
    return this.items;
  }

  private makeLine(points: Float32Array, closed: boolean): LineSegments2 {
    const geometry = new LineSegmentsGeometry();
    geometry.setPositions(segmentPositions(points, closed));
    const material = new LineMaterial({ linewidth: 3, worldUnits: false, dashSize: 6, gapSize: 4, dashScale: 1 });
    material.clippingPlanes = this.clipping;
    const line = new LineSegments2(geometry, material);
    line.computeLineDistances();
    return line;
  }

  // The selected seam shows its weld direction: a dot where it starts, an arrowhead where it ends.
  // Small arrows that travel along the selected seam in its weld direction.
  private updateFlow(color: string) {
    const current = this.items.find((x) => x.id === this.selectedId) ?? null;
    if ((current?.points ?? null) === this.flowKey) return;
    this.flowKey = current?.points ?? null;
    for (const child of [...this.flowGroup.children]) {
      this.flowGroup.remove(child);
      const m = child as THREE.Mesh;
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    }
    const item = this.items.find((x) => x.id === this.selectedId);
    if (!item || item.points.length < 6) { this.flow = null; return; }
    const p = item.points, n = p.length / 3;
    const cumulative = [0];
    const count = item.closed ? n + 1 : n;
    for (let i = 1; i < count; i++) {
      const a = (i - 1) % n, b = i % n;
      cumulative.push(cumulative[i - 1]! + Math.hypot(p[b * 3]! - p[a * 3]!, p[b * 3 + 1]! - p[a * 3 + 1]!, p[b * 3 + 2]! - p[a * 3 + 2]!));
    }
    const length = cumulative[cumulative.length - 1]!;
    const size = Math.min(this.markerSize * 0.35, length / 8);
    const arrows = Math.max(2, Math.min(14, Math.round(length / (this.markerSize * 2))));
    const geometry = new THREE.ConeGeometry(size * 0.35, size, 10);
    for (let k = 0; k < arrows; k++) {
      const cone = new THREE.Mesh(geometry.clone(), new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: true, opacity: 0.9, clippingPlanes: this.clipping }));
      cone.renderOrder = 29;
      this.flowGroup.add(cone);
    }
    geometry.dispose();
    this.flow = { cumulative, points: p, closed: item.closed, phase: this.flow?.phase ?? 0 };
    this.tickFlow(0);
  }

  // The seams just changed (split pieces, merged or reversed seam) pulse thick for a moment.
  // After an edit: changed seams pulse and show their names; a reversed seam's arrows run briefly.
  flashSeams(ids: string[], reversed = false) {
    this.flash = ids.length ? { ids: new Set(ids), t: 0 } : null;
    if (reversed) this.flowSeconds = 1.6;
    this.clearLabels();
    for (const id of ids) {
      const item = this.items.find((x) => x.id === id);
      const name = this.names.get(id);
      if (!item || !name) continue;
      const n = item.points.length / 3, mid = Math.floor((n - 1) / 2);
      const a = new THREE.Vector3().fromArray(item.points, mid * 3), b = new THREE.Vector3().fromArray(item.points, Math.min(n - 1, mid + 1) * 3);
      const label = textSprite(name, item.color ?? cssVar("--accent", "#E97F01"));
      label.position.copy(a.add(b).multiplyScalar(0.5));
      label.renderOrder = 34;
      this.labelGroup.add(label);
    }
  }

  names = new Map<string, string>();

  private clearLabels() {
    for (const child of [...this.labelGroup.children]) {
      this.labelGroup.remove(child);
      const s = child as THREE.Sprite;
      s.material.map?.dispose();
      s.material.dispose();
    }
  }

  private tickFlash(dt: number): boolean {
    const fl = this.flash;
    if (!fl) return false;
    fl.t += dt;
    const done = fl.t > 1.6;
    if (done && fl.t - dt <= 1.6) for (const id of fl.ids) { const line = this.lines.get(id); if (line) line.material.linewidth = id === this.selectedId ? 6 : 4; }
    const pulse = done ? 0 : Math.abs(Math.sin(fl.t * Math.PI * 2.5));
    for (const id of fl.ids) {
      const line = this.lines.get(id);
      if (line) { line.material.linewidth = (id === this.selectedId ? 6 : 4) + pulse * 7; line.material.depthTest = done && id !== this.selectedId && !this.xray; }
    }
    if (fl.t > 3.5) { this.flash = null; this.clearLabels(); return false; }
    return true;
  }

  // Moves the arrows (and any flash); returns false when there is nothing to animate.
  tickFlow(dt: number): boolean {
    const flashing = this.tickFlash(dt);
    const f = this.flow;
    if (!f) return flashing;
    const length = f.cumulative[f.cumulative.length - 1]!;
    if (length <= 0) return flashing;
    const moving = this.flowSeconds > 0;
    if (moving) { this.flowSeconds -= dt; f.phase = (f.phase + dt * Math.max(length / 3, this.markerSize * 2)) % length; }
    const n = f.points.length / 3;
    const arrows = this.flowGroup.children;
    const up = new THREE.Vector3(0, 1, 0);
    arrows.forEach((cone, k) => {
      const d = (f.phase + (k * length) / arrows.length) % length;
      let i = 0;
      while (i < f.cumulative.length - 2 && f.cumulative[i + 1]! < d) i++;
      const a = i % n, b = (i + 1) % n;
      const seg = f.cumulative[i + 1]! - f.cumulative[i]! || 1;
      const t = (d - f.cumulative[i]!) / seg;
      const pa = new THREE.Vector3().fromArray(f.points, a * 3), pb = new THREE.Vector3().fromArray(f.points, b * 3);
      cone.position.lerpVectors(pa, pb, t);
      cone.quaternion.setFromUnitVectors(up, pb.clone().sub(pa).normalize());
    });
    return flashing || this.flowSeconds > 0;
  }

  private updateMarkers(color: string) {
    for (const child of [...this.markers.children]) {
      this.markers.remove(child);
      const m = child as THREE.Mesh;
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    }
    const item = this.items.find((x) => x.id === this.selectedId);
    if (!item || item.closed || item.points.length < 6) return;

    const p = item.points, n = p.length / 3;
    const start = new THREE.Vector3().fromArray(p, 0);
    const end = new THREE.Vector3().fromArray(p, (n - 1) * 3);
    const before = new THREE.Vector3().fromArray(p, (n - 2) * 3);
    const material = { color, depthTest: false, clippingPlanes: this.clipping };

    let length = 0;
    for (let i = 1; i < n; i++) length += Math.hypot(p[i * 3]! - p[i * 3 - 3]!, p[i * 3 + 1]! - p[i * 3 - 2]!, p[i * 3 + 2]! - p[i * 3 - 1]!);
    const size = Math.min(this.markerSize * 0.7, length * 0.12);
    const dot = new THREE.Mesh(new THREE.SphereGeometry(size * 0.3, 16, 12), new THREE.MeshBasicMaterial(material));
    dot.position.copy(start);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(size * 0.45, size * 1.2, 16), new THREE.MeshBasicMaterial(material));
    cone.position.copy(end);
    cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.clone().sub(before).normalize());
    cone.translateY(-size * 0.6);
    for (const marker of [dot, cone]) { marker.renderOrder = 30; this.markers.add(marker); }
  }

  private restyle() {
    const candidate = cssVar("--seam-candidate", "#ABABA5");
    const accepted = cssVar("--seam-accepted", "#628047");
    const selected = cssVar("--accent", "#E97F01");
    const hover = cssVar("--discovery-t3", "#E99E46");

    for (const item of this.items) {
      const line = this.lines.get(item.id);
      if (!line) continue;
      const m = line.material;
      const isSelected = item.id === this.selectedId;
      const isHover = item.id === this.hoverId;
      m.color.set(isSelected ? selected : isHover ? hover : item.status === "accepted" ? item.color ?? accepted : candidate);
      m.linewidth = isSelected || isHover ? 6 : item.status === "accepted" ? 4 : 2.5;
      m.dashed = item.status === "candidate" && !isSelected;
      // The selected seam is drawn over the part so it can always be seen, even inside a corner.
      m.depthTest = !this.xray && !isSelected;
      m.transparent = this.xray;
      m.needsUpdate = true;
      line.renderOrder = isSelected ? 12 : isHover ? 11 : 10;
    }
    this.updateMarkers(selected);
    this.updateFlow(cssVar("--light-sand", "#F6F6EE"));
  }

  private disposeLine(line: LineSegments2) {
    this.group.remove(line);
    line.geometry.dispose();
    line.material.dispose();
  }
}
