import { z } from "zod";
import { join } from "node:path";
import { tmpdir } from "node:os";

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().max(65535).default(8000),
  CORS_ORIGIN: z.string().default(""),
  MAX_FILE_MB: z.coerce.number().positive().max(2000).default(500),
  UPLOAD_DIR: z.string().min(1).default(join(tmpdir(), "weld-uploads")),
  UPLOAD_TTL_MIN: z.coerce.number().positive().max(1440).default(30),
  STATIC_DIR: z.string().min(1).default(join(import.meta.dir, "../../frontend/dist")),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
});

/**
 * load and validate environment config
 */
function loadConfig() {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    throw new Error(`Invalid environment configuration: ${details}`);
  }
  const env = parsed.data;

  const corsOrigins = env.CORS_ORIGIN.split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const isProduction = env.NODE_ENV === "production";

  const effectiveCorsOrigins = corsOrigins;

  if (corsOrigins.length === 0) {
    console.error(
      "[config] CORS_ORIGIN is empty — only same-origin requests are allowed. Set CORS_ORIGIN explicitly when the UI runs on a different origin.",
    );
  }

  return {
    port: env.PORT,
    corsOrigins: effectiveCorsOrigins,
    corsOriginsConfigured: corsOrigins.length > 0,
    maxFileBytes: Math.floor(env.MAX_FILE_MB * 1024 * 1024),
    maxFileMb: env.MAX_FILE_MB,
    uploadDir: env.UPLOAD_DIR,
    uploadTtlMs: env.UPLOAD_TTL_MIN * 60 * 1000,
    staticDir: env.STATIC_DIR,
    isProduction,
    nodeEnv: env.NODE_ENV,
  };
}

export const config = loadConfig();
export type AppConfig = typeof config;
