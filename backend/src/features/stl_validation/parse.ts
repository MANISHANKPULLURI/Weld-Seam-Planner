import {MeshError} from "./types";


export const MAX_TRIANGLES = 5_000_000;
const MIN_BYTES = 15;
const HEADER_BYTES = 80;
const COUNT_END = 84;
const TRIANGLE_BYTES = 50;
const ASCII_SNIFF_BYTES = 256;


const NUM = "([-+]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:[eE][-+]?\\d+)?)";
const VERTEX = new RegExp(`vertex\\s+${NUM}\\s+${NUM}\\s+${NUM}`, "gi");
const VERTEX_LINE = /^[ \t]*vertex\b/gim;

function looksLikeAscii(buffer: ArrayBuffer): boolean {
const head = new TextDecoder()
    .decode(new Uint8Array(buffer, 0, Math.min(buffer.byteLength, ASCII_SNIFF_BYTES)))
    .trimStart()
    .toLowerCase();
  return head.startsWith("solid") && head.includes("facet");
}


function parseBinary(view: DataView, count: number, maxTriangles: number): Float32Array {
  if (count > maxTriangles) {
    throw new MeshError(
      `This part has ${count.toLocaleString()} triangles. The limit is ${maxTriangles.toLocaleString()}. Try a simplified export.`,
    );
  }
  return new Float32Array(0);
}



