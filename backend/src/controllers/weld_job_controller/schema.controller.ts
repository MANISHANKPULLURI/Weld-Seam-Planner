import type { Context } from "hono";



let cachedSchema: string | null = null;

try {
  const file = Bun.file(new URL("../../../schema/weld-job.schema.json", import.meta.url));

  if (await file.exists()) {
    cachedSchema = await file.text();
  }
} catch {
  cachedSchema = null;
}

/**
 * handle GET cached weld job schema request
 */
export async function handleGetWeldJobSchema(c: Context): Promise<Response> {

  if (cachedSchema === null) {
    return c.json({ error: { code: "not_found", message: "Schema not generated", details: null } }, 500);
  }

  return new Response(cachedSchema, { headers: { "Content-Type": "application/json" } });
}
