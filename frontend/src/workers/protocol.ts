import type { DetectOptions, DetectResult, Health, MeshStage, RepairStats, StlFormat } from "@weld/core";

export type AnalyseRequest = { type: "analyse"; id: number; source: File | ArrayBuffer; name: string };

export type RepairRequest = {
  type: "repair";
  id: number;
  vertices: Float32Array;
  indices: Uint32Array;
  previous: Pick<Health, "degenerateRemoved" | "duplicateRemoved">;
};

export type DetectRequest = {
  type: "detect";
  id: number;
  vertices: Float32Array;
  indices: Uint32Array;
  bodyOfTriangle: Uint32Array;
  options: DetectOptions;
};

export type MeshWorkerRequest = AnalyseRequest | RepairRequest | DetectRequest;

export type AnalysedPayload = {
  vertices: Float32Array;
  indices: Uint32Array;
  orientedIndices: Uint32Array;
  bodyOfTriangle: Uint32Array;
  health: Health;
  format: StlFormat;
  solids: number;
  warnings: string[];
  sha256: string | null;
  sizeBytes: number;
};

export type RepairedPayload = {
  indices: Uint32Array;
  bodyOfTriangle: Uint32Array;
  health: Health;
  stats: RepairStats;
  binary: ArrayBuffer;
};

export type MeshWorkerResponse =
  | { type: "progress"; id: number; stage: MeshStage; fraction: number }
  | { type: "analysed"; id: number; result: AnalysedPayload }
  | { type: "repaired"; id: number; result: RepairedPayload }
  | { type: "detected"; id: number; result: DetectResult }
  | { type: "error"; id: number; message: string };
