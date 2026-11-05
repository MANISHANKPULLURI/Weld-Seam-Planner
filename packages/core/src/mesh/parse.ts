import { MeshError } from "./types.ts";
import type { ParsedStl } from "./types.ts";

export const MAX_TRIANGLES = 15_000_000;

export type ParseOptions = { maxTriangles?: number; onProgress?: (fraction: number) => void };

const HEAD_BYTES = 4096;

/**
 * parse an stl buffer as binary or ascii with recovery warnings
 */
export function parseStl(buffer: ArrayBuffer, options: ParseOptions = {}): ParsedStl {

  const maxTriangles = options.maxTriangles ?? MAX_TRIANGLES;
  const onProgress = options.onProgress ?? (() => {});
  const size = buffer.byteLength;

  if (size < 15) throw new MeshError("This file is too small to be an STL.");

  const bytes = new Uint8Array(buffer);
  const declared = size >= 84 ? new DataView(buffer).getUint32(80, true) : 0;
  const expected = 84 + declared * 50;
  const exactBinary = size >= 84 && declared > 0 && expected === size;
  const ascii = looksAscii(bytes);

  if (exactBinary && !ascii) return parseBinary(buffer, declared, [], maxTriangles, onProgress);

  if (ascii) {
    const parsed = parseAscii(bytes, maxTriangles, onProgress);
    if (parsed) return parsed;
  }

  if (exactBinary) return parseBinary(buffer, declared, [], maxTriangles, onProgress);

  if (size >= 84) {

    const available = Math.floor((size - 84) / 50);

    if (declared > 0 && expected < size && size - expected <= Math.max(4096, size * 0.05)) {
      return parseBinary(buffer, declared, ["The file has extra bytes after the last triangle. They were ignored."], maxTriangles, onProgress, true);
    }

    if (declared > 0 && expected > size && available > 0 && available >= declared * 0.5) {
      return parseBinary(buffer, available, [`The file is shorter than its header says. ${available.toLocaleString("en-US")} of ${declared.toLocaleString("en-US")} triangles were read.`], maxTriangles, onProgress, true);
    }

    if (declared === 0 && available > 0 && (size - 84) % 50 === 0) {
      return parseBinary(buffer, available, ["The header said the file has no triangles, so the count was taken from the file size."], maxTriangles, onProgress, true);
    }
  }

  throw new MeshError("This file doesn't look like an STL.");
}


/**
 * detect an ascii stl by its solid header and facet keywords
 */
function looksAscii(bytes: Uint8Array): boolean {

  const end = Math.min(bytes.length, HEAD_BYTES);
  let i = 0;

  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) i = 3;
  while (i < end && isSpace(bytes[i]!)) i++;

  if (!matchesWord(bytes, i, "solid")) return false;

  let head = "";

  for (let k = i; k < end; k++) {
    if (bytes[k] === 0) return false;
    head += String.fromCharCode(bytes[k]! | 0x20);
  }

  return head.includes("facet") || head.includes("endsolid");
}


const PLAUSIBLE_COORDINATE = 1e9;

/**
 * Recovery paths (padded, truncated, zero-count files) are only trusted if the coordinates look
 * like real geometry; otherwise random bytes would be read as nonsense triangles.
 * parse binary stl triangles with optional recovery validation
 */
function parseBinary(buffer: ArrayBuffer, count: number, warnings: string[], maxTriangles: number, onProgress: (f: number) => void, recovering = false): ParsedStl {

  if (count > maxTriangles) {
    throw new MeshError(`This part has ${count.toLocaleString("en-US")} triangles. The limit is ${maxTriangles.toLocaleString("en-US")}. Try a simplified export.`);
  }

  const view = new DataView(buffer);
  const positions = new Float32Array(count * 9);
  const normals = new Float32Array(count * 3);
  const step = Math.max(1, Math.floor(count / 50));

  let offset = 84;
  let p = 0;

  for (let t = 0; t < count; t++) {

    for (let k = 0; k < 3; k++) {
      const n = view.getFloat32(offset + k * 4, true);
      normals[t * 3 + k] = Number.isFinite(n) ? n : 0;
    }
    offset += 12;

    for (let k = 0; k < 9; k++) {
      const value = view.getFloat32(offset, true);
      if (recovering && !(Math.abs(value) <= PLAUSIBLE_COORDINATE)) throw new MeshError("This file doesn't look like an STL.");
      if (!Number.isFinite(value)) throw new MeshError("The file contains invalid coordinates.");
      positions[p++] = value;
      offset += 4;
    }

    offset += 2;

    if (t % step === 0) onProgress(t / count);
  }

  return { positions, normals, format: "binary", triangleCount: count, solids: 0, warnings };
}


/**
 * parse ascii stl vertices and normals by scanning tokens
 */
function parseAscii(bytes: Uint8Array, maxTriangles: number, onProgress: (f: number) => void): ParsedStl | null {

  const n = bytes.length;
  const maxValues = maxTriangles * 9;
  const maxNormals = maxTriangles * 3;

  let values = new Float32Array(Math.max(9 * 64, Math.floor(n / 25)));
  let count = 0;
  const facetNormals: number[] = [];
  let solids = 0;
  let nextReport = 1 << 22;
  let i = 0;

  while (i < n) {

    const c = bytes[i]! | 0x20;

    if (c === 0x76 && (i === 0 || isSpace(bytes[i - 1]!)) && matchesWord(bytes, i, "vertex")) {

      i += 6;

      for (let k = 0; k < 3; k++) {

        while (i < n && isSpace(bytes[i]!)) i++;

        const start = i;
        while (i < n && !isSpace(bytes[i]!)) i++;

        const value = start < i ? Number(String.fromCharCode.apply(null, Array.from(bytes.subarray(start, i)))) : NaN;

        if (!Number.isFinite(value)) throw new MeshError("The file contains invalid coordinates.");

        if (count === values.length) {
          const grown = new Float32Array(values.length * 2);
          grown.set(values);
          values = grown;
        }

        values[count++] = value;
      }

      if (count > maxValues) {
        throw new MeshError(`This part has more than ${maxTriangles.toLocaleString("en-US")} triangles. Try a simplified export.`);
      }

      continue;
    }

    if (c === 0x6e && (i === 0 || isSpace(bytes[i - 1]!)) && matchesWord(bytes, i, "normal")) {
      i += 6;
      for (let k = 0; k < 3; k++) {
        while (i < n && isSpace(bytes[i]!)) i++;
        const start = i;
        while (i < n && !isSpace(bytes[i]!)) i++;
        const value = Number(String.fromCharCode.apply(null, Array.from(bytes.subarray(start, i))));
        facetNormals.push(Number.isFinite(value) ? value : 0);
      }
      if (facetNormals.length > maxNormals) {
        throw new MeshError(`This part has more than ${maxTriangles.toLocaleString("en-US")} triangles. Try a simplified export.`);
      }
      continue;
    }

    if (c === 0x65 && matchesWord(bytes, i, "endsolid")) {
      solids++;
      i += 8;
      continue;
    }

    i++;

    if (i > nextReport) {
      onProgress(i / n);
      nextReport += 1 << 22;
    }
  }

  if (count < 9) return null;

  const warnings: string[] = [];
  const usable = count - (count % 9);

  if (usable !== count) warnings.push(`${(count - usable) / 3} stray vertices at the end of the file were ignored.`);

  const triangleCount = usable / 9;
  const normals = facetNormals.length >= triangleCount * 3 ? new Float32Array(facetNormals.slice(0, triangleCount * 3)) : null;

  return { positions: values.slice(0, usable), normals, format: "ascii", triangleCount, solids: Math.max(1, solids), warnings };
}


/**
 * match a case-insensitive keyword at a byte offset
 */
function matchesWord(bytes: Uint8Array, at: number, word: string): boolean {

  if (at + word.length > bytes.length) return false;

  for (let k = 0; k < word.length; k++) {
    if ((bytes[at + k]! | 0x20) !== word.charCodeAt(k)) return false;
  }

  return true;
}


/**
 * test whether a byte is ascii whitespace
 */
function isSpace(b: number): boolean {
  return b === 0x20 || b === 0x09 || b === 0x0a || b === 0x0d || b === 0x0b || b === 0x0c;
}
