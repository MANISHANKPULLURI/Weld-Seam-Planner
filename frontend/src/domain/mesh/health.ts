import type { Bounds } from "./primitives";


export type Health = {
  triangles: number;
  bodies: number;
  openEdges: number;
  nonManifold: number;
  flippedFaces: number;
  bounds: Bounds;
};
