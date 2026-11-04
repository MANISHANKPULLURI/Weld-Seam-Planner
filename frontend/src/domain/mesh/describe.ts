import type { Health } from "./health";

export type HealthCheck = { id: "openEdges" | "nonManifold" | "bodies" | "flippedFaces"; label: string; value: number; ok: boolean; hint: string };

export function healthChecks(h: Health): HealthCheck[] {
  return [
    { id: "openEdges", label: "Open edges", value: h.openEdges, ok: h.openEdges === 0, hint: "The surface has gaps or openings." },
    { id: "nonManifold", label: "Non-manifold edges", value: h.nonManifold, ok: h.nonManifold === 0, hint: "Edges shared by more than two faces, common where plates touch." },
    { id: "bodies", label: "Separate bodies", value: h.bodies, ok: h.bodies <= 1, hint: "The file holds several parts. Normal for welded assemblies." },
    { id: "flippedFaces", label: "Flipped faces", value: h.flippedFaces, ok: h.flippedFaces === 0, hint: "These faces point inward. Repair turns them outward." },
  ];
}

export function hasIssues(h: Health): boolean {
  return h.openEdges > 0 || h.bodies > 1 || h.flippedFaces > 0;
}

export function formatCount(n: number): string {
  return n.toLocaleString("en-US");
}

export function formatSize(size: { x: number; y: number; z: number }): string {
  const largest = Math.max(size.x, size.y, size.z);
  const digits = largest >= 100 ? 1 : largest >= 1 ? 2 : 3;
  return [size.x, size.y, size.z].map((v) => v.toFixed(digits)).join(" × ");
}
