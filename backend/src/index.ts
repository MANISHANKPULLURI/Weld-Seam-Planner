import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { secureHeaders } from "hono/secure-headers";
import { existsSync } from "node:fs";
import { realpath } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { config } from "./config.ts";
import { meshRoutes } from "./routes/mesh.routes.ts";
import { schemaRoutes } from "./routes/schema.routes.ts";
import { weldJobRoutes } from "./routes/weld.routes.ts";
import { procedureRoutes } from "./routes/procedures.routes.ts";


export const app = new Hono();

app.use(logger());
app.use(secureHeaders({
  contentSecurityPolicy: {
    defaultSrc: ["'self'"],
    baseUri: ["'self'"],
    objectSrc: ["'none'"],
    frameAncestors: ["'none'"],
  },
  strictTransportSecurity: "max-age=15552000; includeSubDomains",
  xContentTypeOptions: "nosniff",
  referrerPolicy: "no-referrer",
}));

app.use("/api/*", cors({
  origin: config.corsOrigins.length ? config.corsOrigins : [],
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
app.route("/api/v1/procedures", procedureRoutes);


const staticDir = resolve(config.staticDir);

if (existsSync(join(staticDir, "index.html"))) {

  app.get("*", async (c, next) => {

    if (c.req.path.startsWith("/api/")) return next();

    const rawPath = c.req.path;
    if (rawPath.includes("\0")) return c.json({ error: "Bad request" }, 400);

    let decoded: string;
    try {
      decoded = decodeURIComponent(rawPath);
    } catch {
      return c.json({ error: "Bad request" }, 400);
    }
    if (decoded.includes("\0")) return c.json({ error: "Bad request" }, 400);

    
    if (decoded.split("/").some((segment) => segment.startsWith(".") && segment.length > 1)) {
      return c.json({ error: "Not found" }, 404);
    }

    const resolved = resolve(staticDir, "." + decoded);

    if (resolved !== staticDir && !resolved.startsWith(staticDir + sep)) {
      return new Response(Bun.file(join(staticDir, "index.html")), { headers: { "Content-Type": "text/html; charset=utf-8" } });
    }

    let realRoot: string;
    try {
      realRoot = await realpath(staticDir);
    } catch {
      realRoot = staticDir;
    }

    let real: string;
    try {
      real = await realpath(resolved);
    } catch {
      real = resolved;
    }

    const insideRoot = real === realRoot || real.startsWith(realRoot + sep);

    if (insideRoot) {
      const file = Bun.file(real);
      if (real !== realRoot && await file.exists()) return new Response(file);
    }

    return new Response(Bun.file(join(staticDir, "index.html")), { headers: { "Content-Type": "text/html; charset=utf-8" } });
  });
}


app.notFound((c) => {
  return c.json({ error: "Not found" }, 404);
});

app.onError((err, c) => {
  const safe = `${c.req.method} ${c.req.path}`.replace(/[\r\n]/g, "");
  console.error(`${safe} failed:`, err);
  return c.json({ error: "Internal error" }, 500);
});


export default {
  port: config.port,
  maxRequestBodySize: config.maxFileBytes + 1024 * 1024,
  fetch: app.fetch,
};
