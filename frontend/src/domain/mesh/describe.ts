import type { Health } from "./health";

export function describeHealth(h: Health): string[] {
  const out: string[] = [];
  if (h.openEdges > 0) out.push(`${h.openEdges} open edge${h.openEdges === 1 ? "" : "s"} — the surface is not fully closed.`);
  if (h.bodies > 1) out.push(`${h.bodies} separate bodies — the file contains loose parts.`);
  if (h.hasFlippedFaces) out.push("Some faces may be flipped — normals are inconsistent.");
  return out;
}
