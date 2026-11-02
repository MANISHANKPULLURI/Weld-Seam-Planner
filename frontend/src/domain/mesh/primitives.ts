export type Vec3 = { x: number; y: number; z: number };
export type Triangle = { a: Vec3; b: Vec3; c: Vec3 };
export type Mesh = { triangles: Triangle[] };
export type Bounds = { min: Vec3; max: Vec3; size: Vec3 };
