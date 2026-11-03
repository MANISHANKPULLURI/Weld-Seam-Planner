import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { secureHeaders } from "hono/secure-headers";
import { bodyLimit } from "hono/body-limit";
import { meshRoutes } from "./controllers/mesh_detection_repair_controller/mesh.controller.ts";
import { schemaRoutes } from "./controllers/weld_job_controller/schema.controller.ts";
import { weldJobRoutes } from "./controllers/weld_job_controller/weldJob.controller.ts";
import { projectRoutes } from "./controllers/project_controller/project.controller.ts";

export const app = new Hono();

app.use(logger());
app.use(secureHeaders());
app.use(
  bodyLimit({
    maxSize: 550 * 1024 * 1024,
    onError: (c) => {
      console.error("Payload too large");
      return c.json({ error: "Payload too large" }, 413);
    },
  }),
);

const corsOrigins = (process.env.CORS_ORIGIN || "").split(",").map((s) => s.trim()).filter(Boolean);

app.use("/api/*", cors({
  origin: corsOrigins.length ? corsOrigins : ["http://localhost:5173", "http://localhost:3000", "http://localhost:5174", "http://127.0.0.1:5173"],
  allowMethods: ["GET", "POST", "OPTIONS"],
  allowHeaders: ["Content-Type", "X-Filename", "x-filename", "X-Requested-With"],
  exposeHeaders: ["Content-Length"],
  credentials: false,
  maxAge: 600,
}));

app.get("/api/v1/health", (c) => {
  return c.json({ status: "ok" });
});

app.route("/api/v1/mesh", meshRoutes);
app.route("/api/v1/schema", schemaRoutes);
app.route("/api/v1/weld-jobs", weldJobRoutes);
app.route("/api/v1/projects", projectRoutes);

app.notFound((c) => {
  return c.json({ error: "Not found" }, 404);
});

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: "Internal error" }, 500);
});

export default {
  port: Number(process.env.PORT) || 8000,
  fetch: app.fetch,
};
