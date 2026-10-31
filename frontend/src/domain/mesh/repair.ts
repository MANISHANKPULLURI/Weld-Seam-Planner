import type { Mesh } from "./primitives";

export const REPAIR_AVAILABLE = false;

export interface RepairResult {
  mesh: Mesh;
  closed: number;
  aligned: number;
}

export function repairMesh(_mesh: Mesh): RepairResult {
  throw new Error("Repair not available");
}
