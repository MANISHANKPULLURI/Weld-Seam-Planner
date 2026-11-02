import { Hono } from "hono";


export const schemaRoutes = new Hono();

schemaRoutes.get("/weld-job", async (c) => {

  const file = Bun.file(new URL("../../schema/weld-job.schema.json", import.meta.url));

  if (!(await file.exists())) {
    return c.json({ error: { code: "not_found", message: "Schema not generated", details: null } }, 500);
  }

  const schema = await file.json();

  return c.json(schema);
});
