import { z } from "zod";


export const partSchema = z.object({

  filename: z.string().describe("Original STL filename"),

  sha256: z.string().regex(/^[0-9a-f]{64}$/).nullable().describe("SHA256 hex of original file bytes, null if the browser could not hash"),

  triangle_count: z.number().int().nonnegative().describe("Triangle count in original file"),

  bbox_mm: z.object({

    min: z.tuple([z.number().describe("Min X mm"), z.number().describe("Min Y mm"), z.number().describe("Min Z mm")]).describe("Minimum corner of bounding box in millimetres"),

    max: z.tuple([z.number().describe("Max X mm"), z.number().describe("Max Y mm"), z.number().describe("Max Z mm")]).describe("Maximum corner of bounding box in millimetres"),

  }).describe("Bounding box in job frame millimetres"),

  repaired: z.boolean().describe("Whether mesh repair was applied"),

}).describe("Part metadata");


export type Part = z.infer<typeof partSchema>;
