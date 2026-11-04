import { z } from "zod";


export const gmawProcessSchema = z.object({

  kind: z.literal("gmaw").describe("Gas metal arc welding"),

  iso_4063: z.union([z.literal(131).describe("MIG 131"), z.literal(135).describe("MAG 135")]).describe("ISO 4063 process code"),

}).describe("GMAW process");


export const fcawProcessSchema = z.object({

  kind: z.literal("fcaw").describe("Flux cored arc welding"),

  iso_4063: z.literal(136).describe("ISO 4063 136"),

}).describe("FCAW process");


export const gtawProcessSchema = z.object({

  kind: z.literal("gtaw").describe("Gas tungsten arc welding"),

  iso_4063: z.literal(141).describe("ISO 4063 141"),

}).describe("GTAW process");


export const processSchema = z.discriminatedUnion("kind", [

  gmawProcessSchema,

  fcawProcessSchema,

  gtawProcessSchema,

]).describe("Welding process discriminated by kind");


export const procedureSchema = z.object({

  id: z.string().describe("Stable procedure identifier"),

  name: z.string().describe("EXAMPLE preset name, never recommendation"),

  process: processSchema.describe("Process kind and ISO code"),

  wire: z.object({

    diameter_mm: z.number().positive().describe("Wire diameter in millimetres"),

  }).describe("Wire"),

  gas: z.object({

    name: z.string().describe("Gas name example mix"),

    flow_l_min: z.number().nonnegative().nullable().describe("Gas flow litres per minute or null"),

  }).describe("Gas"),

  electrical: z.object({

    voltage_v: z.number().positive().describe("Arc voltage, volts"),

    current_a: z.number().positive().describe("Welding current, amps (needed for arc energy)"),

    wire_feed_speed_m_min: z.number().positive().nullable().describe("Wire feed speed metres per minute or null"),

  }).describe("Electrical parameters"),

  motion: z.object({

    travel_speed_mm_min: z.number().positive().describe("Travel speed millimetres per minute"),

  }).describe("Motion"),

  thermal_efficiency_k: z.number().min(0).max(1).describe("Thermal efficiency k 0.8 gmaw/fcaw 0.6 gtaw editable"),

  limits: z.object({

    heat_input_kj_mm: z.object({

      min: z.number().nullable().describe("Minimum heat input or null"),

      max: z.number().nullable().describe("Maximum heat input or null"),

    }).describe("Heat input limits"),

    travel_speed_mm_min: z.object({

      min: z.number().nullable().describe("Minimum travel speed or null"),

      max: z.number().nullable().describe("Maximum travel speed or null"),

    }).nullable().describe("Travel speed limits or null"),

    max_throat_per_pass_mm: z.number().positive().nullable().describe("Largest throat one pass can lay; bigger welds need more passes. Null = no check"),

  }).describe("User-defined limits"),

  seam_defaults: z.object({

    weld_size: z.object({ basis: z.enum(["a", "z"]), value_mm: z.number().positive() }).describe("Weld size given to seams this procedure is first applied to"),

    travel_angle_deg: z.number().describe("Default travel angle, positive = push"),

    stick_out_mm: z.number().nonnegative().describe("Default contact tip to work distance"),

  }).describe("Defaults for seams when this procedure is first applied"),

}).describe("Welding procedure");


export type Procedure = z.infer<typeof procedureSchema>;
