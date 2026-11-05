import { Hono } from "hono";
import { handleGetWeldJobSchema } from "../controllers/weld_job_controller/schema.controller.ts";


export const schemaRoutes = new Hono();

schemaRoutes.get("/weld-job", handleGetWeldJobSchema);
