import { parseStl } from "./parse.ts";
import { weldVertices } from "./weld.ts";
import { boundaryRegistry, buildTopology, labelBodies } from "./topology.ts";
import { orientFaces } from "./orient.ts";
import { fillBoundaryLoops } from "./repair.ts";
import { computeBounds } from "./bounds.ts";
import type { Health, ProgressFn, StlFormat } from "./types.ts";

export type AnalyseOptions = {
  tolerance?: number;
  maxTriangles?: number;
  onProgress?: ProgressFn;
};

export type AnalysedMesh = {
  vertices: Float32Array;
  indices: Uint32Array;
  orientedIndices: Uint32Array;
  bodyOfTriangle: Uint32Array;
  format: StlFormat;
  solids: number;
  warnings: string[];
  tolerance: number;
  health: Health;
};

export type RepairStats = {
  closed: number;
  aligned: number;
  beforeTriangles: number;
  afterTriangles: number;
};

export type RepairedMesh = {
  indices: Uint32Array;
  bodyOfTriangle: Uint32Array;
  health: Health;
  stats: RepairStats;
};

export function analyseMesh(buffer: ArrayBuffer, options: AnalyseOptions = {}): AnalysedMesh {

  const progress = options.onProgress ?? (() => {});

  progress("read", 0);
  const parsed = parseStl(buffer, { maxTriangles: options.maxTriangles, onProgress: (f) => progress("read", f) });
  progress("read", 1);

  progress("weld", 0);
  const welded = weldVertices(parsed.positions, options.tolerance, (f) => progress("weld", f), parsed.normals);
  progress("weld", 1);

  progress("topology", 0);
  const vertexCount = welded.vertices.length / 3;
  const topology = buildTopology(welded.indices, vertexCount);
  const bodies = labelBodies(welded.indices, vertexCount, topology);
  progress("topology", 1);

  progress("orient", 0);
  const orientation = orientFaces(welded.vertices, welded.indices, topology, { fileNormals: welded.fileNormals, onProgress: (f) => progress("orient", f) });
  progress("orient", 1);

  return {
    vertices: welded.vertices,
    indices: welded.indices,
    orientedIndices: orientation.indices,
    bodyOfTriangle: bodies.bodyOfTriangle,
    format: parsed.format,
    solids: parsed.solids,
    warnings: parsed.warnings,
    tolerance: welded.tolerance,
    health: {
      triangles: welded.indices.length / 3,
      bodies: bodies.bodyCount,
      openEdges: topology.openEdges,
      nonManifold: topology.nonManifold,
      flippedFaces: orientation.flipped,
      degenerateRemoved: welded.degenerateRemoved,
      duplicateRemoved: welded.duplicateRemoved,
      isManifoldSolid: topology.openEdges === 0 && topology.nonManifold === 0,
      bounds: computeBounds(welded.vertices),
    },
  };
}

// Takes the analysed, already oriented mesh (orientedIndices). Hole fans are wound against their loop,
// so they match their neighbours; closed shells are re-checked for inside-out volume.
export function repairMesh(vertices: Float32Array, indices: Uint32Array, previous?: Pick<Health, "degenerateRemoved" | "duplicateRemoved" | "flippedFaces">): RepairedMesh {

  const vertexCount = vertices.length / 3;
  const before = buildTopology(indices, vertexCount);

  const filled = before.openEdges > 0 ? fillBoundaryLoops(boundaryRegistry(indices, before), indices) : indices;
  const filledTopology = filled === indices ? before : buildTopology(filled, vertexCount);

  const orientation = orientFaces(vertices, filled, filledTopology, { islands: false });
  const after = buildTopology(orientation.indices, vertexCount);
  const bodies = labelBodies(orientation.indices, vertexCount, after);
  const residual = orientFaces(vertices, orientation.indices, after, { islands: false });

  return {
    indices: orientation.indices,
    bodyOfTriangle: bodies.bodyOfTriangle,
    health: {
      triangles: orientation.indices.length / 3,
      bodies: bodies.bodyCount,
      openEdges: after.openEdges,
      nonManifold: after.nonManifold,
      flippedFaces: residual.flipped,
      degenerateRemoved: previous?.degenerateRemoved ?? 0,
      duplicateRemoved: previous?.duplicateRemoved ?? 0,
      isManifoldSolid: after.openEdges === 0 && after.nonManifold === 0,
      bounds: computeBounds(vertices),
    },
    stats: {
      closed: (filled.length - indices.length) / 3,
      aligned: (previous?.flippedFaces ?? 0) + orientation.flipped,
      beforeTriangles: indices.length / 3,
      afterTriangles: orientation.indices.length / 3,
    },
  };
}
