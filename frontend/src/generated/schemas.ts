// AUTO-GENERATED — do not edit manually



export type WeldJobJsonSchema = typeof import("./weld-job.schema.json");


export type Vec3 = [number, number, number];

export type Frame = {
  units: "mm" | "cm" | "m" | "inch";
  handedness: "right";
  up_axis: "+z" | "+y";
  gravity: Vec3;
  part_to_job: {
    translation_mm: Vec3;
    rotation_quaternion_xyzw: [number, number, number, number];
  };
};

export type Part = {
  filename: string;
  sha256: string;
  triangle_count: number;
  bbox_mm: { min: Vec3; max: Vec3 };
  repaired: boolean;
};

export type WeldJob = {
  schema_version: "1.0.0";
  job: {
    id: string;
    name: string;
    created_at: string;
    tool: { name: "armatrix-weld-planner"; version: string };
    status: "draft" | "approved";
    notes: string;
    execution: { arc_enabled: boolean; default_supervision: "operator_confirm" | "auto" };
  };
  frame: Frame;
  part: Part;
  procedures: unknown[];
  access: unknown;
  seams: unknown[];
  totals: { seam_count: number; total_length_mm: number; arc_time_s: number; estimated_cycle_time_s: number };
  validation: { errors: unknown[]; warnings: unknown[] };
  integrity: { content_sha256: string };
};
