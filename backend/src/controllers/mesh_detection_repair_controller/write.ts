export function packCleanBinarySTL(uniqueVertices: Float32Array, indexArray: Int32Array): ArrayBuffer {

  const totalTriangles = indexArray.length / 3;

  const allocationBytesSize = 84 + totalTriangles * 50;

  const buffer = new ArrayBuffer(allocationBytesSize);
  const outputView = new DataView(buffer);

  const headerString = "Engineered Manifold Repair Module Client Output Matrix Base Profile Node Export.";

  for (let i = 0; i < Math.min(headerString.length, 80); i++) {
    outputView.setUint8(i, headerString.charCodeAt(i));
  }

  outputView.setUint32(80, totalTriangles, true);

  let offset = 84;

  for (let i = 0; i < totalTriangles; i++) {

    const idx0 = indexArray[i * 3]! * 3;
    const idx1 = indexArray[i * 3 + 1]! * 3;
    const idx2 = indexArray[i * 3 + 2]! * 3;

    const ax = uniqueVertices[idx1]! - uniqueVertices[idx0]!;
    const ay = uniqueVertices[idx1 + 1]! - uniqueVertices[idx0 + 1]!;
    const az = uniqueVertices[idx1 + 2]! - uniqueVertices[idx0 + 2]!;

    const bx = uniqueVertices[idx2]! - uniqueVertices[idx0]!;
    const by = uniqueVertices[idx2 + 1]! - uniqueVertices[idx0 + 1]!;
    const bz = uniqueVertices[idx2 + 2]! - uniqueVertices[idx0 + 2]!;

    let nX = ay * bz - az * by;
    let nY = az * bx - ax * bz;
    let nZ = ax * by - ay * bx;

    const lengthVectorScalar = Math.sqrt(nX * nX + nY * nY + nZ * nZ);

    if (lengthVectorScalar > 0) {
      nX /= lengthVectorScalar;
      nY /= lengthVectorScalar;
      nZ /= lengthVectorScalar;
    }

    outputView.setFloat32(offset, nX, true);
    outputView.setFloat32(offset + 4, nY, true);
    outputView.setFloat32(offset + 8, nZ, true);

    offset += 12;

    const verticesCoordinatesNodeIndexes = [idx0, idx1, idx2];

    for (const vIdx of verticesCoordinatesNodeIndexes) {
      outputView.setFloat32(offset, uniqueVertices[vIdx]!, true);
      outputView.setFloat32(offset + 4, uniqueVertices[vIdx + 1]!, true);
      outputView.setFloat32(offset + 8, uniqueVertices[vIdx + 2]!, true);
      offset += 12;
    }

    outputView.setUint16(offset, 0, true);
    offset += 2;
  }

  return buffer;
}
