import { Hono } from "hono";
import { handleListProcedures } from "../controllers/weld_job_controller/weldJob.controller.ts";


export const procedureRoutes = new Hono();

procedureRoutes.get("/presets", handleListProcedures);
