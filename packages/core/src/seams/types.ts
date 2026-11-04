export type SeamSource = "inside_corner" | "outside_corner" | "contact" | "intersection" | "edge_chain" | "drawn";

export type JointType = "fillet" | "butt" | "corner" | "unknown";

// Geometry is in file coordinates; the confirmed units and up axis are applied on top.
// normalsA/normalsB hold, per point, the two surfaces the seam sits between (equal for one surface).
export type SeamPath = {
  points: Float32Array;
  normalsA: Float32Array;
  normalsB: Float32Array;
  closed: boolean;
  length: number;
};

export type SeamCandidate = SeamPath & {
  id: string;
  source: SeamSource;
  jointType: JointType;
  angleDeg: number;
  confidence: number;
  reason: string;
};

export type DetectOptions = {
  featureAngleDeg: number;
  minLength: number;
  contactTolerance: number;
  includeOutside: boolean;
};

export type DetectResult = {
  candidates: SeamCandidate[];
  featureChains: SeamPath[];
};
