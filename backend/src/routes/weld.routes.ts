import { Hono } from "hono";
import { handleCompileWeldJob, handleValidateWeldJob } from "../controllers/weld_job_controller/weldJob.controller.ts";


export const weldJobRoutes = new Hono();

weldJobRoutes.post("/validate", handleValidateWeldJob);
weldJobRoutes.post("/compile", handleCompileWeldJob);
