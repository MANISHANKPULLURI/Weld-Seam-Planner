import { Hono } from "hono";
import { z } from "zod";
import { EXAMPLE_PROCEDURES, compileWeldJob, procedureSchema, sealWeldJob, verifyWeldJob, weldJobSchema } from "@weld/core";
import type { JobInput } from "@weld/core";


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

  const intact = await verifyWeldJob(parsed.data);
  const warnings = intact ? [] : [{ path: "integrity.content_sha256", message: "The content hash does not match: the file was changed after export." }];
  return c.json({ valid: true, errors: [], warnings }, 200);
});


const vec3 = z.tuple([z.number(), z.number(), z.number()]);
const seamWeldSchema = z.object({
  procedureId: z.string(),
  overrides: z.object({ voltage_v: z.number().positive().optional(), current_a: z.number().positive().optional(), wire_feed_speed_m_min: z.number().positive().optional(), travel_speed_mm_min: z.number().positive().optional() }),
  size: z.object({ basis: z.enum(["a", "z"]), value_mm: z.number().positive() }),
  passes: z.number().int().positive(),
  intermittent: z.object({ weld_length_mm: z.number().positive(), pitch_mm: z.number().positive() }).nullable(),
  torch: z.object({ work_angle_offset_deg: z.number(), travel_angle_deg: z.number(), stick_out_mm: z.number().nonnegative() }),
  start: z.object({ approach_mm: z.number().nonnegative(), run_in_mm: z.number().nonnegative() }),
  end: z.object({ retract_mm: z.number().nonnegative(), crater_fill: z.boolean() }),
  position: z.enum(["PA", "PB", "PC", "PD", "PE", "PF", "PG", "inclined"]).nullable(),
});
// Same as the app's JobInput, with plain number arrays instead of typed arrays.
const compileInputSchema = z.object({
  meta: z.object({ id: z.string().optional(), name: z.string(), notes: z.string().default(""), status: z.enum(["draft", "approved"]).default("draft"), createdAt: z.string().datetime().optional() }),
  part: z.object({ filename: z.string(), sha256: z.string().regex(/^[0-9a-f]{64}$/).nullable(), triangles: z.number().int().nonnegative(), min: vec3, max: vec3, repaired: z.boolean() }),
  units: z.enum(["mm", "cm", "m", "inch"]),
  upAxis: z.enum(["+z", "+y"]),
  procedures: z.array(procedureSchema),
  seams: z.array(z.object({
    id: z.string(), name: z.string(), jointType: z.enum(["fillet", "butt", "corner", "unknown"]), angleDeg: z.number(),
    points: z.array(z.number()).min(6), normalsA: z.array(z.number()), normalsB: z.array(z.number()), closed: z.boolean(),
    weld: seamWeldSchema.optional(), waitAfterS: z.number().nonnegative().default(0),
  })).max(5000),
  airSpeedMmS: z.number().positive().default(150),
  waypointSpacingMm: z.number().positive().default(5),
  supervision: z.enum(["operator_confirm", "auto"]).default("operator_confirm"),
});

weldJobRoutes.post("/compile", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: { code: "invalid_json", message: "Malformed JSON", details: null } }, 400);
  }
  const parsed = compileInputSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: { code: "invalid_input", message: "Invalid compile input", details: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) } }, 400);
  }
  const input: JobInput = {
    ...parsed.data,
    seams: parsed.data.seams.map((s) => {
      const points = new Float32Array(s.points);
      let length = 0;
      for (let i = 3; i < points.length; i += 3) length += Math.hypot(points[i]! - points[i - 3]!, points[i + 1]! - points[i - 2]!, points[i + 2]! - points[i - 1]!);
      return { ...s, points, normalsA: new Float32Array(s.normalsA), normalsB: new Float32Array(s.normalsB), length };
    }),
  };
  return c.json(await sealWeldJob(compileWeldJob(input)), 200);
});


export const procedureRoutes = new Hono();

procedureRoutes.get("/presets", (c) => c.json({ procedures: EXAMPLE_PROCEDURES, note: "EXAMPLE starting points only. Use the values from your welding procedure specification." }));
