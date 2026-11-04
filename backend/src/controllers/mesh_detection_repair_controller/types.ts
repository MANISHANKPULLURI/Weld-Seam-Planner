export class MeshError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MeshError";
  }
}

export type Health = {
  triangles: number;
  bodies: number;
  openEdges: number;
  nonManifold: number;
  flippedFaces: number;
  isManifoldSolid: boolean;
  bounds: {
    min: { x: number; y: number; z: number };
    max: { x: number; y: number; z: number };
    size: { x: number; y: number; z: number };
  };
};

export type WeldResult = {
  uniqueVertices: Float32Array;
  indexArray: Int32Array;
};

export type Diagnostics = {
  boundaryEdgeRegistry: Map<number, number[]>;
  stats: {
    openBoundaryCount: number;
    nonManifoldCount: number;
    isManifoldSolid: boolean;
  };
};

export type OrientationResult = {
  indexArray: Int32Array;
  flipped: number;
  conflicts: number;
};

export type RepairStats = {
  closed: number;
  aligned: number;
  beforeTriangles: number;
  afterTriangles: number;
};
