import { MeshError } from "./types.ts";


export const MAX_TRIANGLES = 5_000_000;

const MIN_BYTES = 84;

const ASCII_SNIFF_BYTES = 512;


export function parseIncomingMeshBuffer(buffer: ArrayBuffer): Float32Array {

  if (buffer.byteLength < MIN_BYTES) {
    throw new MeshError("This file doesn't look like a valid STL.");
  }

  const view = new DataView(buffer);

  const triangleCount = view.getUint32(80, true);

  const expectedBinarySize = 84 + triangleCount * 50;

  const isBinary = buffer.byteLength >= 84 && buffer.byteLength === expectedBinarySize && triangleCount > 0;

  const headText = new TextDecoder().decode(new Uint8Array(buffer, 0, Math.min(buffer.byteLength, ASCII_SNIFF_BYTES))).trimStart().toLowerCase();
  const looksAscii = headText.startsWith("solid") && headText.includes("facet");

  if (isBinary && !looksAscii) {

    if (triangleCount > MAX_TRIANGLES) {
      throw new MeshError(`This part has ${triangleCount.toLocaleString()} triangles. The limit is ${MAX_TRIANGLES.toLocaleString()}. Try a simplified export.`);
    }

    if (buffer.byteLength < expectedBinarySize) {
      throw new MeshError("This file doesn't look like a valid STL.");
    }

    const positions = new Float32Array(triangleCount * 9);

    let offset = 84;
    let posIdx = 0;

    for (let i = 0; i < triangleCount; i++) {

      offset += 12;

      for (let v = 0; v < 3; v++) {

        const x = view.getFloat32(offset, true);
        const y = view.getFloat32(offset + 4, true);
        const z = view.getFloat32(offset + 8, true);

        if (!isFinite(x) || !isFinite(y) || !isFinite(z)) {
          throw new MeshError("The file contains invalid coordinates.");
        }

        positions[posIdx++] = x;
        positions[posIdx++] = y;
        positions[posIdx++] = z;

        offset += 12;
      }

      offset += 2;
    }

    if (posIdx === 0) {
      throw new MeshError("No triangles found. This doesn't look like an STL file.");
    }

    return positions;
  }

  const text = new TextDecoder().decode(buffer);
  const regex = /vertex\s+(-?[\d.]+e?[-+]*\d*)\s+(-?[\d.]+e?[-+]*\d*)\s+(-?[\d.]+e?[-+]*\d*)/gi;

  const positionsArray: number[] = [];
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {

    const x = parseFloat(match[1]!);
    const y = parseFloat(match[2]!);
    const z = parseFloat(match[3]!);

    if (!isFinite(x) || !isFinite(y) || !isFinite(z)) {
      throw new MeshError("The file contains invalid coordinates.");
    }

    positionsArray.push(x, y, z);
  }

  if (positionsArray.length === 0 || positionsArray.length % 9 !== 0) {
    throw new MeshError("No triangles found. This doesn't look like an STL file.");
  }

  if (positionsArray.length / 9 > MAX_TRIANGLES) {
    throw new MeshError(`This part has ${(positionsArray.length / 9).toLocaleString()} triangles. The limit is ${MAX_TRIANGLES.toLocaleString()}. Try a simplified export.`);
  }

  return new Float32Array(positionsArray);
}
