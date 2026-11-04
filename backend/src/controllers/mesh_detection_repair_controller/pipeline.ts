import { parseIncomingMeshBuffer } from "./parse.ts";
import { weldVertexCoordinates } from "./weld.ts";
import { computeAdjacencyDiagnostics, computeBounds, estimateBodies } from "./diagnostics.ts";
import { healMeshBoundaries } from "./repair.ts";
import { orientConsistently } from "./normals.ts";
import { packCleanBinarySTL } from "./write.ts";
import type { Health, RepairStats } from "./types.ts";


export const DEFAULT_WELD_TOLERANCE = 1e-4;


export function runValidationPipeline(buffer: ArrayBuffer, tolerance = DEFAULT_WELD_TOLERANCE) {

  const positions = parseIncomingMeshBuffer(buffer);

  const welded = weldVertexCoordinates(positions, tolerance);

  const diagnostics = computeAdjacencyDiagnostics(welded.indexArray);

  const orientation = orientConsistently(welded.uniqueVertices, welded.indexArray);

  const health: Health = {
    triangles: welded.indexArray.length / 3,
    bodies: estimateBodies(welded.indexArray),
    openEdges: diagnostics.stats.openBoundaryCount,
    nonManifold: diagnostics.stats.nonManifoldCount,
    flippedFaces: orientation.flipped,
    isManifoldSolid: diagnostics.stats.isManifoldSolid,
    bounds: computeBounds(welded.uniqueVertices),
  };

  return {
    health,
    diagnostics,
    welded,
    positions,
  };
}


export function runRepairPipeline(buffer: ArrayBuffer, tolerance = DEFAULT_WELD_TOLERANCE) {

  const positions = parseIncomingMeshBuffer(buffer);

  const welded = weldVertexCoordinates(positions, tolerance);

  const diagnostics = computeAdjacencyDiagnostics(welded.indexArray);

  let healedIndices = welded.indexArray;
  let closed = 0;

  if (diagnostics.stats.openBoundaryCount > 0) {
    healedIndices = healMeshBoundaries(diagnostics.boundaryEdgeRegistry, welded.indexArray);
    closed = (healedIndices.length - welded.indexArray.length) / 3;
  }

  const orientation = orientConsistently(welded.uniqueVertices, healedIndices);
  const repairedIndices = orientation.indexArray;

  const newDiagnostics = computeAdjacencyDiagnostics(repairedIndices);

  const health: Health = {
    triangles: repairedIndices.length / 3,
    bodies: estimateBodies(repairedIndices),
    openEdges: newDiagnostics.stats.openBoundaryCount,
    nonManifold: newDiagnostics.stats.nonManifoldCount,
    flippedFaces: orientConsistently(welded.uniqueVertices, repairedIndices).flipped,
    isManifoldSolid: newDiagnostics.stats.isManifoldSolid,
    bounds: computeBounds(welded.uniqueVertices),
  };

  const stats: RepairStats = {
    closed,
    aligned: orientation.flipped,
    beforeTriangles: welded.indexArray.length / 3,
    afterTriangles: repairedIndices.length / 3,
  };

  return {
    health,
    welded: {
      uniqueVertices: welded.uniqueVertices,
      indexArray: repairedIndices,
    },
    binary: packCleanBinarySTL(welded.uniqueVertices, repairedIndices),
    stats,
  };
}
