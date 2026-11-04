import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { secureHeaders } from "hono/secure-headers";
import { existsSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { MAX_FILE_BYTES, meshRoutes } from "./controllers/mesh_detection_repair_controller/mesh.controller.ts";
import { schemaRoutes } from "./controllers/weld_job_controller/schema.controller.ts";
import { weldJobRoutes } from "./controllers/weld_job_controller/weldJob.controller.ts";


export const app = new Hono();

app.use(logger());
app.use(secureHeaders());

const corsOrigins = (process.env.CORS_ORIGIN || "").split(",").map((s) => s.trim()).filter(Boolean);

app.use("/api/*", cors({
  origin: corsOrigins.length ? corsOrigins : ["http://localhost:5173", "http://localhost:3000"],
  allowMethods: ["GET", "POST", "OPTIONS"],
  allowHeaders: ["Content-Type"],
  maxAge: 600,
}));

app.get("/api/v1/health", (c) => {
  return c.json({ status: "ok" });
});

app.route("/api/v1/mesh", meshRoutes);
app.route("/api/v1/schema", schemaRoutes);
app.route("/api/v1/weld-jobs", weldJobRoutes);


const staticDir = resolve(process.env.STATIC_DIR || join(import.meta.dir, "../../frontend/dist"));

if (existsSync(join(staticDir, "index.html"))) {

  app.get("*", async (c, next) => {

    if (c.req.path.startsWith("/api/")) return next();

    let requested = staticDir;

    try {
      requested = resolve(staticDir, "." + decodeURIComponent(c.req.path));
    } catch {}

    const insideRoot = requested === staticDir || requested.startsWith(staticDir + sep);

    if (insideRoot) {
      const file = Bun.file(requested);
      if (requested !== staticDir && await file.exists()) return new Response(file);
    }

    return new Response(Bun.file(join(staticDir, "index.html")), { headers: { "Content-Type": "text/html; charset=utf-8" } });
  });
}


app.notFound((c) => {
  return c.json({ error: "Not found" }, 404);
});

app.onError((err, c) => {
  console.error(`${c.req.method} ${c.req.path} failed:`, err);
  return c.json({ error: "Internal error" }, 500);
});


export default {
  port: Number(process.env.PORT) || 8000,
  maxRequestBodySize: MAX_FILE_BYTES + 1024 * 1024,
  fetch: app.fetch,
};
