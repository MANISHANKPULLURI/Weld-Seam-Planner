import { Hono } from "hono";
import { weldJobSchema } from "./weldJob.ts";


export const weldJobRoutes = new Hono();


weldJobRoutes.post("/validate", async (c) => {

  let body: unknown;

  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: { code: "invalid_json", message: "Malformed JSON", details: null } }, 400);
  }

  const str = JSON.stringify(body);

  if (str.length > 5 * 1024 * 1024) {
    return c.json({ error: { code: "payload_too_large", message: "Body too large", details: null } }, 413);
  }

  const parsed = weldJobSchema.safeParse(body);

  if (!parsed.success) {

    const details = parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message }));

    return c.json({ valid: false, errors: details, warnings: [] }, 200);
  }

  return c.json({ valid: true, errors: [], warnings: [] }, 200);
});
