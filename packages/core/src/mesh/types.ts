export class MeshError extends Error {
/**
 * create a mesh error with its name set
 */
  constructor(message: string) {
    super(message);
    this.name = "MeshError";
  }
}

export type Vec3 = { x: number; y: number; z: number };

export type Bounds = { min: Vec3; max: Vec3; size: Vec3 };

export type Health = {
  triangles: number;
  bodies: number;
  openEdges: number;
  nonManifold: number;
  flippedFaces: number;
  degenerateRemoved: number;
  duplicateRemoved: number;
  isManifoldSolid: boolean;
  bounds: Bounds;
};

export type StlFormat = "binary" | "ascii";

export type ParsedStl = {
  positions: Float32Array;
  normals: Float32Array | null;
  format: StlFormat;
  triangleCount: number;
  solids: number;
  warnings: string[];
};

export type MeshStage = "read" | "weld" | "topology" | "orient";

export type ProgressFn = (stage: MeshStage, fraction: number) => void;
