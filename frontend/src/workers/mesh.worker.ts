import { MeshError, analyseMesh, repairMesh, sha256Hex, writeBinaryStl } from "@weld/core";
import type { MeshStage } from "@weld/core";
import type { MeshWorkerRequest, MeshWorkerResponse } from "./protocol";

const BROWSER_MAX_TRIANGLES = 6_000_000;

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<MeshWorkerRequest>) => void) | null;
  postMessage: (message: MeshWorkerResponse, transfer?: Transferable[]) => void;
};

function send(message: MeshWorkerResponse, transfer: Transferable[] = []) {
  scope.postMessage(message, transfer);
}

function progressReporter(id: number) {
  let lastStage: MeshStage | null = null;
  let lastFraction = -1;
  return (stage: MeshStage, fraction: number) => {
    if (stage === lastStage && fraction - lastFraction < 0.02 && fraction < 1) return;
    lastStage = stage;
    lastFraction = fraction;
    send({ type: "progress", id, stage, fraction });
  };
}

function messageOf(err: unknown): string {
  if (err instanceof MeshError) return err.message;
  if (err instanceof RangeError) return "This file is too large for the browser to hold in memory. Try a simplified export.";
  return "Something went wrong while reading this file.";
}

scope.onmessage = async (event) => {
  const request = event.data;

  try {
    if (request.type === "analyse") {
      const buffer = request.source instanceof ArrayBuffer ? request.source : await request.source.arrayBuffer();
      const sizeBytes = buffer.byteLength;
      const sha256 = await sha256Hex(buffer);
      const result = analyseMesh(buffer, { maxTriangles: BROWSER_MAX_TRIANGLES, onProgress: progressReporter(request.id) });

      send(
        {
          type: "analysed",
          id: request.id,
          result: {
            vertices: result.vertices,
            indices: result.indices,
            orientedIndices: result.orientedIndices,
            bodyOfTriangle: result.bodyOfTriangle,
            health: result.health,
            format: result.format,
            solids: result.solids,
            warnings: result.warnings,
            sha256,
            sizeBytes,
          },
        },
        [result.vertices.buffer, result.indices.buffer, result.orientedIndices.buffer, result.bodyOfTriangle.buffer],
      );
      return;
    }

    const repaired = repairMesh(request.vertices, request.indices, request.previous);
    const binary = writeBinaryStl(request.vertices, repaired.indices);

    send(
      { type: "repaired", id: request.id, result: { indices: repaired.indices, bodyOfTriangle: repaired.bodyOfTriangle, health: repaired.health, stats: repaired.stats, binary } },
      [repaired.indices.buffer, repaired.bodyOfTriangle.buffer, binary],
    );
  } catch (err) {
    send({ type: "error", id: request.id, message: messageOf(err) });
  }
};
