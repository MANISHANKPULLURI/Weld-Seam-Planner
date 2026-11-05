import type { Seam } from "../state/store";

export const JOINT_LABEL: Record<Seam["jointType"], string> = { fillet: "Fillet weld", butt: "Butt weld", corner: "Corner weld", unknown: "Weld" };

export const MANUAL: Partial<Record<Seam["source"], string>> = { edge_chain: "Picked edge", drawn: "Drawn by hand" };

export const JOINT_HELP: Record<Seam["jointType"], string> = {
  fillet: "Fillet weld: a triangle-shaped weld filling the inside corner where two plates meet (T or L shape). The most common weld.",
  butt: "Butt weld: joins two plates lying edge to edge in the same plane.",
  corner: "Corner weld: joins two plates at their outside corner, like the edge of a box.",
  unknown: "Added by you, so the joint type is not known.",
};

export const POSITION_LABEL: Record<string, string> = {
  PA: "flat", PB: "horizontal fillet", PC: "horizontal", PD: "overhead fillet", PE: "overhead", PF: "vertical up", PG: "vertical down", inclined: "inclined",
};
