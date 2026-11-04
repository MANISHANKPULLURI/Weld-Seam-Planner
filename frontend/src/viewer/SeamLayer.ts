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
    this.restyle();
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

  // Polylines within `maxPixels` of the cursor, nearest first, one hit per path (positions in part coordinates).
  static pick(paths: { points: Float32Array; closed: boolean }[], partMatrix: THREE.Matrix4, camera: THREE.Camera, size: { w: number; h: number }, px: number, py: number, maxPixels: number): PathHit[] {
    const a = new THREE.Vector3(), b = new THREE.Vector3();
    const hits: PathHit[] = [];

    paths.forEach((path, index) => {
      let best: PathHit | null = null;
      const n = path.points.length / 3;
      const segments = path.closed ? n : n - 1;
      for (let i = 0; i < segments; i++) {
        const j = (i + 1) % n;
        a.fromArray(path.points, i * 3).applyMatrix4(partMatrix);
        b.fromArray(path.points, j * 3).applyMatrix4(partMatrix);
        const sa = a.clone().project(camera), sb = b.clone().project(camera);
        if (sa.z > 1 || sb.z > 1) continue;
        const ax = (sa.x + 1) / 2 * size.w, ay = (1 - sa.y) / 2 * size.h;
        const bx = (sb.x + 1) / 2 * size.w, by = (1 - sb.y) / 2 * size.h;
        const dx = bx - ax, dy = by - ay;
        const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
        const d = Math.hypot(ax + dx * t - px, ay + dy * t - py);
        if (d <= maxPixels && (!best || d < best.pixels)) best = { index, segment: i, t, pixels: d, world: a.clone().lerp(b, t) };
      }
      if (best) hits.push(best);
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
    const line = new LineSegments2(geometry, material);
    line.computeLineDistances();
    return line;
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
  }

  private disposeLine(line: LineSegments2) {
    this.group.remove(line);
    line.geometry.dispose();
    line.material.dispose();
  }
}
