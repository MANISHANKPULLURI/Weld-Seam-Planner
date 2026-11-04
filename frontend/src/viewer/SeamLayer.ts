import * as THREE from "three";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";

export type SeamDrawItem = { id: string; points: Float32Array; closed: boolean; status: "candidate" | "accepted" };

export type PathHit = { index: number; segment: number; t: number; pixels: number; world: THREE.Vector3 };

function cssVar(name: string, fallback: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
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

  constructor() {
    this.group.add(this.markers);
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
      this.ends!.setMatrixAt(i * 2, m.makeTranslation(x.points[0]!, x.points[1]!, x.points[2]!));
      this.ends!.setMatrixAt(i * 2 + 1, m.makeTranslation(x.points[n * 3 - 3]!, x.points[n * 3 - 2]!, x.points[n * 3 - 1]!));
    });
    this.ends.renderOrder = 13;
    this.group.add(this.ends);
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
    const size = Math.min(this.markerSize, length * 0.25);
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
      m.color.set(isSelected ? selected : isHover ? hover : item.status === "accepted" ? accepted : candidate);
      m.linewidth = isSelected || isHover ? 6 : item.status === "accepted" ? 4 : 2.5;
      m.dashed = item.status === "candidate" && !isSelected;
      m.depthTest = !this.xray;
      m.transparent = this.xray;
      m.needsUpdate = true;
      line.renderOrder = isSelected ? 12 : isHover ? 11 : 10;
    }
    this.updateMarkers(selected);
  }

  private disposeLine(line: LineSegments2) {
    this.group.remove(line);
    line.geometry.dispose();
    line.material.dispose();
  }
}
