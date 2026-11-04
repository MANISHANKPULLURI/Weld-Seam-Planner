import type { Health } from "./health";

export type CheckLevel = "ok" | "info" | "warn";

export type HealthCheck = { id: "openEdges" | "nonManifold" | "bodies" | "flippedFaces"; label: string; value: number; ok: boolean; level: CheckLevel; hint: string };

function check(id: HealthCheck["id"], label: string, value: number, level: CheckLevel, hint: string): HealthCheck {
  return { id, label, value, ok: level !== "warn", level, hint };
}

// Several bodies are normal for a welded assembly, so they are reported as information, not a problem.
export function healthChecks(h: Health): HealthCheck[] {
  return [
    check("openEdges", "Open edges", h.openEdges, h.openEdges === 0 ? "ok" : "warn", "The surface has gaps or openings."),
    check("nonManifold", "Non-manifold edges", h.nonManifold, h.nonManifold === 0 ? "ok" : "warn", "Edges shared by more than two faces, common where plates touch."),
    check("bodies", "Separate bodies", h.bodies, h.bodies <= 1 ? "ok" : "info", "Several parts in one file. Normal for welded assemblies."),
    check("flippedFaces", "Flipped faces", h.flippedFaces, h.flippedFaces === 0 ? "ok" : "warn", "These faces point inward. Repair turns them outward."),
  ];
}

export function hasIssues(h: Health): boolean {
  return h.openEdges > 0 || h.flippedFaces > 0;
}

export function formatCount(n: number): string {
  return n.toLocaleString("en-US");
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function cleanupNote(h: Health): string | null {
  const parts: string[] = [];
  if (h.degenerateRemoved > 0) parts.push(`${formatCount(h.degenerateRemoved)} zero-area`);
  if (h.duplicateRemoved > 0) parts.push(`${formatCount(h.duplicateRemoved)} duplicate`);
  if (parts.length === 0) return null;
  return `Removed ${parts.join(" and ")} triangle${h.degenerateRemoved + h.duplicateRemoved === 1 ? "" : "s"}. They add nothing to the shape.`;
}

export function formatSize(size: { x: number; y: number; z: number }): string {
  const largest = Math.max(size.x, size.y, size.z);
  const digits = largest >= 100 ? 1 : largest >= 1 ? 2 : 3;
  return [size.x, size.y, size.z].map((v) => v.toFixed(digits)).join(" × ");
}
