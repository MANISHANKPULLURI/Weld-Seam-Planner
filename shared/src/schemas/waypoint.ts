import { z } from "zod";


const vec3 = z.tuple([z.number().describe("X"), z.number().describe("Y"), z.number().describe("Z")]).describe("3D vector");


export const waypointSchema = z.object({

  s_mm: z.number().nonnegative().describe("Arc length along seam in millimetres"),

  position_mm: vec3.describe("Weld point position in millimetres"),

  tangent: vec3.describe("Seam tangent unit vector"),

  surface_normals: z.tuple([vec3.describe("First surface normal"), vec3.describe("Second surface normal")]).describe("Two outward surface normals or duplicate if single surface"),

  torch_axis: vec3.describe("Torch axis unit vector pointing from torch toward weld"),

  contact_tip_mm: vec3.describe("Contact tip position in millimetres"),

}).describe("Seam waypoint with frame");


export type Waypoint = z.infer<typeof waypointSchema>;
