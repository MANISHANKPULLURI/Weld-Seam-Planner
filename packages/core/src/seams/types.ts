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

// Limits detection to what the user is looking at. keep is a plane in file coordinates: points with
// normal·p + constant >= 0 are kept (the section's visible side).
export type DetectRegion = {
  hiddenBodies?: number[];
  keep?: { normal: [number, number, number]; constant: number } | null;
};

export type DetectOptions = {
  featureAngleDeg: number;
  minLength: number;
  contactTolerance: number;
  includeOutside: boolean;
  region?: DetectRegion;
};

export type DetectResult = {
  candidates: SeamCandidate[];
  featureChains: SeamPath[];
};
