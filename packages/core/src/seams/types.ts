export type SeamSource = "inside_corner" | "outside_corner" | "contact" | "intersection" | "edge_chain" | "drawn";

export type JointType = "fillet" | "butt" | "corner" | "unknown";



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
