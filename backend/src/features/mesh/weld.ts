import type { WeldResult } from "./types.ts";


export function weldVertexCoordinates(positions: Float32Array, tolerance = 1e-4): WeldResult {

  const rawVertexCount = positions.length / 3;

  const uniqueVertices: number[] = [];
  const indexArray = new Int32Array(rawVertexCount);

  const vertexHashMap = new Map<string, number>();

  let uniqueCounter = 0;

  const scale = 1 / tolerance;

  for (let i = 0; i < rawVertexCount; i++) {

    const x = positions[i * 3]!;
    const y = positions[i * 3 + 1]!;
    const z = positions[i * 3 + 2]!;

    const kX = Math.round(x * scale);
    const kY = Math.round(y * scale);
    const kZ = Math.round(z * scale);

    const spatialHashKey = `${kX}_${kY}_${kZ}`;

    if (vertexHashMap.has(spatialHashKey)) {
      indexArray[i] = vertexHashMap.get(spatialHashKey)!;
    } else {

      vertexHashMap.set(spatialHashKey, uniqueCounter);
      indexArray[i] = uniqueCounter;

      uniqueVertices.push(x!, y!, z!);

      uniqueCounter++;
    }
  }

  return {
    uniqueVertices: new Float32Array(uniqueVertices),
    indexArray,
  };
}
