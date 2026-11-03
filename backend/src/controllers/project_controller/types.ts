export type InputMode = "single" | "multiple";
export type ProjectUnits = "mm" | "inch";
export type ComponentStatus = "pending" | "uploading" | "validating" | "validated" | "error";

export type ComponentMetadata = {
  id: string;
  name: string;
  originalFilename: string;
  triangleCount: number;
  vertexCount: number;
  bounds: { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number }; size: { x: number; y: number; z: number } };
  health: { triangles: number; bodies: number; openEdges: number; nonManifold: number; isManifoldSolid: boolean; bounds: ComponentMetadata["bounds"] };
  units: ProjectUnits;
  status: ComponentStatus;
  error?: string;
};

export type ProjectRecord = {
  id: string;
  inputMode: InputMode;
  units: ProjectUnits;
  components: ComponentMetadata[];
  createdAt: string;
};
