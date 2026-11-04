import { z } from "zod";

import { frameSchema } from "./frame.ts";
import { partSchema } from "./part.ts";
import { procedureSchema } from "./procedure.ts";
import { seamSchema } from "./seam.ts";


export const weldJobSchema = z.object({

  schema_version: z.literal("1.0.0").describe("Schema version 1.0.0"),

  job: z.object({

    id: z.string().describe("Job identifier job_YYYYMMDD_HHMM_xx"),

    name: z.string().describe("Job name e.g. Stiffened panel rev B"),

    created_at: z.string().datetime().describe("ISO8601 UTC creation timestamp"),

    tool: z.object({

      name: z.literal("armatrix-weld-planner").describe("Tool name"),

      version: z.string().describe("Tool version 0.1.0"),

    }).describe("Tool"),

    status: z.enum(["draft", "approved"]).describe("Job status draft or approved"),

    notes: z.string().describe("Notes"),

    execution: z.object({

      arc_enabled: z.boolean().describe("Arc enabled flag"),

      default_supervision: z.enum(["operator_confirm", "auto"]).describe("Default supervision mode"),

      air_speed_mm_s: z.number().positive().describe("Torch speed for moves between seams"),

      waypoint_spacing_mm: z.number().positive().describe("Distance between exported waypoints along each seam"),

    }).describe("Execution settings"),

  }).describe("Job metadata"),

  frame: frameSchema.describe("Job frame"),

  part: partSchema.describe("Part"),

  procedures: z.array(procedureSchema).describe("Procedure library"),

  access: z.object({

    entry_ports: z.array(z.object({

      position_mm: z.tuple([z.number().describe("X"), z.number().describe("Y"), z.number().describe("Z")]).describe("Port position millimetres"),

      direction: z.tuple([z.number().describe("X"), z.number().describe("Y"), z.number().describe("Z")]).describe("Port direction unit vector"),

      diameter_mm: z.number().positive().describe("Port diameter millimetres"),

    }).describe("Entry port")).describe("Entry ports"),

    arm: z.object({

      reach_mm: z.number().positive().nullable().describe("Arm reach millimetres or null"),

      tip_diameter_mm: z.number().positive().nullable().describe("Tip diameter millimetres or null"),

    }).describe("Arm"),

  }).describe("Access plan optional"),

  seams: z.array(seamSchema).describe("Seams in execution order sequence must equal position"),

  totals: z.object({

    seam_count: z.number().int().nonnegative().describe("Total seam count"),

    total_length_mm: z.number().nonnegative().describe("Total length millimetres"),

    arc_time_s: z.number().nonnegative().describe("Total arc time seconds"),

    air_travel_mm: z.number().nonnegative().describe("Straight-line torch travel between seams, including approach and retract"),

    air_time_s: z.number().nonnegative().describe("Air travel time at the job's air speed"),

    wait_time_s: z.number().nonnegative().describe("Sum of waits between seams"),

    estimated_cycle_time_s: z.number().nonnegative().describe("Estimated cycle time seconds arc plus travel plus interpass"),

  }).describe("Totals"),

  validation: z.object({

    errors: z.array(z.object({

      path: z.string().describe("JSON path to issue"),

      code: z.string().describe("Error code e.g. seam.no_procedure"),

      severity: z.literal("error").describe("Severity error blocks export"),

      message: z.string().describe("Plain language message"),

    }).describe("Validation error")).describe("Errors block export"),

    warnings: z.array(z.object({

      path: z.string().describe("JSON path"),

      code: z.string().describe("Warning code e.g. seam.heat_above_limit"),

      severity: z.literal("warning").describe("Severity warning allowed"),

      message: z.string().describe("Plain language message"),

    }).describe("Validation warning")).describe("Warnings allowed"),

  }).describe("Validation"),

  integrity: z.object({

    content_sha256: z.string().regex(/^[0-9a-f]{64}$/).describe("SHA256 of document with this field removed for determinism"),

  }).describe("Integrity hash"),

}).describe("Weld job export format");


export type WeldJob = z.infer<typeof weldJobSchema>;
