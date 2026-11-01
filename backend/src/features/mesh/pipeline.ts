import { parseIncomingMeshBuffer } from "./parse.ts";
import { weldVertexCoordinates } from "./weld.ts";
import { computeAdjacencyDiagnostics, computeBounds, estimateBodies } from "./diagnostics.ts";
import { healMeshBoundaries } from "./repair.ts";
import { normalizeNormalOrientations } from "./normals.ts";
import { packCleanBinarySTL } from "./write.ts";


export function runValidationPipeline(buffer: ArrayBuffer) {

  const positions = parseIncomingMeshBuffer(buffer);

  const welded = weldVertexCoordinates(positions);

  const diagnostics = computeAdjacencyDiagnostics(welded.indexArray);

  const bounds = computeBounds(welded.uniqueVertices);
  const bodies = estimateBodies(welded.indexArray);

  const health = {
    triangles: welded.indexArray.length / 3,
    bodies,
    openEdges: diagnostics.stats.openBoundaryCount,
    nonManifold: diagnostics.stats.nonManifoldCount,
    isManifoldSolid: diagnostics.stats.isManifoldSolid,
    bounds,
  };

  return {
    health,
    diagnostics,
    welded,
    positions,
  };
}


export function runRepairPipeline(buffer: ArrayBuffer) {

  const positions = parseIncomingMeshBuffer(buffer);

  const welded = weldVertexCoordinates(positions);

  const diagnostics = computeAdjacencyDiagnostics(welded.indexArray);

  let repairedIndices = welded.indexArray;
  let closed = 0;

  if (diagnostics.stats.openBoundaryCount > 0) {

    const before = repairedIndices.length;
    repairedIndices = healMeshBoundaries(diagnostics.boundaryEdgeRegistry, welded.indexArray);
    closed = (repairedIndices.length - before) / 3;
  }

  const beforeAlign = repairedIndices.slice();

  repairedIndices = normalizeNormalOrientations(welded.uniqueVertices, repairedIndices);

  let aligned = 0;

  for (let i = 0; i < beforeAlign.length; i++) {
    if (beforeAlign[i] !== repairedIndices[i]) aligned++;
  }

  aligned = Math.floor(aligned / 3);

  const newDiagnostics = computeAdjacencyDiagnostics(repairedIndices);
  const bounds = computeBounds(welded.uniqueVertices);
  const bodies = estimateBodies(repairedIndices);

  const health = {
    triangles: repairedIndices.length / 3,
    bodies,
    openEdges: newDiagnostics.stats.openBoundaryCount,
    nonManifold: newDiagnostics.stats.nonManifoldCount,
    isManifoldSolid: newDiagnostics.stats.isManifoldSolid,
    bounds,
  };

  const binary = packCleanBinarySTL(welded.uniqueVertices, repairedIndices);

  return {
    health,
    welded: {
      uniqueVertices: welded.uniqueVertices,
      indexArray: repairedIndices,
    },
    binary,
    stats: {
      closed,
      aligned,
      beforeTriangles: welded.indexArray.length / 3,
      afterTriangles: repairedIndices.length / 3,
    },
  };
}
