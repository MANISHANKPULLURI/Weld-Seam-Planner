import { z } from "zod";

import { waypointSchema } from "./waypoint.ts";


export const seamSchema = z.object({

  id: z.string().describe("Stable seam identifier never renumbered"),

  name: z.string().describe("Seam display name"),

  sequence: z.number().int().positive().describe("Execution order 1-indexed must equal array position"),

  operation: z.literal("weld").describe("Operation weld extensible"),

  joint: z.object({

    type: z.enum(["fillet", "butt", "corner", "t_joint"]).describe("Joint type guess"),

    dihedral_deg: z.number().min(0).max(180).describe("Dihedral angle degrees"),

    concavity: z.enum(["concave", "convex"]).describe("Concavity"),

    type_source: z.enum(["detected", "user"]).describe("Source of joint type"),

  }).describe("Joint"),

  weld_position: z.object({

    iso_6947: z.enum(["PA", "PB", "PC", "PD", "PE", "PF", "PG", "inclined"]).describe("ISO 6947 code derived"),

    aws: z.enum(["1G", "1F", "2G", "2F", "4G", "4F", "3G", "inclined"]).describe("AWS equivalent"),

    source: z.enum(["derived", "user"]).describe("Source derived or user override"),

  }).describe("Weld position"),

  direction: z.enum(["forward", "backward"]).describe("Seam direction"),

  procedure_ref: z.string().describe("Reference to procedure id"),

  overrides: z.record(z.string(), z.unknown()).describe("Per-seam procedure overrides never stored twice beyond procedure"),

  torch: z.object({

    work_angle_offset_deg: z.number().describe("Work angle offset degrees zero is bisector"),

    travel_angle_deg: z.number().describe("Travel angle degrees positive is push"),

    travel_angle_convention: z.literal("positive_push").describe("Travel angle convention"),

    stick_out_mm: z.number().nonnegative().describe("Stick out millimetres"),

  }).describe("Torch settings"),

  start: z.object({

    approach_mm: z.number().nonnegative().describe("Approach distance millimetres"),

    run_in_mm: z.number().nonnegative().describe("Run-in millimetres"),

  }).describe("Start settings"),

  end: z.object({

    retract_mm: z.number().nonnegative().describe("Retract distance millimetres"),

    crater_fill: z.boolean().describe("Crater fill enabled"),

  }).describe("End settings"),

  intermittent: z.object({

    weld_length_mm: z.number().positive().describe("Weld length millimetres"),

    pitch_mm: z.number().positive().describe("Pitch millimetres"),

  }).nullable().describe("Intermittent settings or null for continuous"),

  supervision: z.enum(["operator_confirm", "auto"]).describe("Supervision mode"),

  inspection: z.enum(["visual", "ndt"]).nullable().describe("Inspection requirement or null"),

  geometry: z.object({

    length_mm: z.number().nonnegative().describe("Seam length millimetres"),

    frame_source: z.enum(["two_surfaces", "single_surface"]).describe("Frame source two or single surface"),

    waypoints: z.array(waypointSchema).describe("Waypoints along seam at fixed spacing"),

  }).describe("Geometry"),

  derived: z.object({

    arc_energy_kj_mm: z.number().nonnegative().describe("Arc energy kilojoules per millimetre"),

    heat_input_kj_mm: z.number().nonnegative().describe("Heat input kilojoules per millimetre k*arc"),

    arc_time_s: z.number().nonnegative().describe("Arc time seconds length/travel*60"),

  }).describe("Derived values from procedure and geometry"),

  access: z.object({

    status: z.enum(["ok", "blocked", "not_checked"]).describe("Torch clearance status"),

    method: z.enum(["distance", "voxel"]).nullable().describe("Check method or null"),

  }).describe("Access result"),

  checks: z.object({

    torch_clearance: z.enum(["ok", "blocked"]).describe("Torch clearance check"),

  }).describe("Checks"),

}).describe("Seam with geometry and derived values");


export type Seam = z.infer<typeof seamSchema>;
