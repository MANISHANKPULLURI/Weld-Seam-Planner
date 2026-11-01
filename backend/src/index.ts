import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { meshRoutes } from "./routes/mesh.routes.ts";


export const app = new Hono();

app.use(logger());

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

app.notFound((c) => {
  return c.json({ error: "Not found" }, 404);
});

app.onError((err, c) => {
  return c.json({ error: "Internal error" }, 500);
});


export default {
  port: Number(process.env.PORT) || 3000,
  fetch: app.fetch,
};
