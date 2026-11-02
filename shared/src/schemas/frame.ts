import { z } from "zod";


export const frameSchema = z.object({

  units: z.enum(["mm", "cm", "m", "inch"]).describe("Units for all millimetre fields after part_to_job transform"),

  handedness: z.literal("right").describe("Coordinate handedness right-handed"),

  up_axis: z.enum(["+z", "+y"]).describe("Up axis in job frame"),

  gravity: z.tuple([z.number().describe("Gravity X"), z.number().describe("Gravity Y"), z.number().describe("Gravity Z")]).describe("Gravity vector in job frame"),

  part_to_job: z.object({

    translation_mm: z.tuple([z.number().describe("Translation X mm"), z.number().describe("Translation Y mm"), z.number().describe("Translation Z mm")]).describe("Translation from part to job frame in millimetres"),

    rotation_quaternion_xyzw: z.tuple([z.number().describe("Quaternion X"), z.number().describe("Quaternion Y"), z.number().describe("Quaternion Z"), z.number().describe("Quaternion W")]).describe("Rotation quaternion xyzw from part to job frame"),

  }).describe("Transform from part origin to job frame"),

}).describe("Job frame definition");


export type Frame = z.infer<typeof frameSchema>;
