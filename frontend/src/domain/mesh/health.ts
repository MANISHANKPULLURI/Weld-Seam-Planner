import type { Bounds } from "./primitives";


export type Health = {
  triangles: number;
  bodies: number;
  openEdges: number;
  bounds: Bounds;
  hasFlippedFaces: boolean;
};
