export function normalizeNormalOrientations(uniqueVertices: Float32Array, indexArray: Int32Array): Int32Array {

  const triangleCount = indexArray.length / 3;

  for (let i = 0; i < triangleCount; i++) {

    const i0 = indexArray[i * 3]! * 3;
    const i1 = indexArray[i * 3 + 1]! * 3;
    const i2 = indexArray[i * 3 + 2]! * 3;

    const ax = uniqueVertices[i1]! - uniqueVertices[i0]!;
    const ay = uniqueVertices[i1 + 1]! - uniqueVertices[i0 + 1]!;
    const az = uniqueVertices[i1 + 2]! - uniqueVertices[i0 + 2]!;

    const bx = uniqueVertices[i2]! - uniqueVertices[i0]!;
    const by = uniqueVertices[i2 + 1]! - uniqueVertices[i0 + 1]!;
    const bz = uniqueVertices[i2 + 2]! - uniqueVertices[i0 + 2]!;

    const nX = ay * bz - az * by;
    const nY = az * bx - ax * bz;
    const nZ = ax * by - ay * bx;

    if (nZ < 0) {

      const tempSwap = indexArray[i * 3 + 1]!;
      indexArray[i * 3 + 1] = indexArray[i * 3 + 2]!;
      indexArray[i * 3 + 2] = tempSwap!;
    }

    void nX;
    void nY;
  }

  return indexArray;
}
