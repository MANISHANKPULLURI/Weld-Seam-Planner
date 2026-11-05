import { Hono } from "hono";
import {
  handleCompleteUpload,
  handleRepairMesh,
  handleRepairMeshBinary,
  handleUploadChunk,
  handleUploadInit,
  handleValidateMesh,
} from "../controllers/mesh_detection_repair_controller/mesh.controller.ts";


export const meshRoutes = new Hono();

meshRoutes.post("/validate", handleValidateMesh);
meshRoutes.post("/repair", handleRepairMesh);
meshRoutes.post("/repair/binary", handleRepairMeshBinary);
meshRoutes.post("/upload/init", handleUploadInit);
meshRoutes.post("/upload/:id/chunk", handleUploadChunk);
meshRoutes.post("/upload/:id/complete", handleCompleteUpload);
