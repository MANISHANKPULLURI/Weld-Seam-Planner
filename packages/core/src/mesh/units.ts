import type { Vec3 } from "./types.ts";

export type Units = "mm" | "cm" | "m" | "inch";

export type UpAxis = "+z" | "+y";

export type UnitsGuess = { units: Units; note: string | null };

export const MM_PER_UNIT: Record<Units, number> = { mm: 1, cm: 10, m: 1000, inch: 25.4 };


export const UP_AXIS_QUATERNION_XYZW: Record<UpAxis, [number, number, number, number]> = {
  "+z": [0, 0, 0, 1],
  "+y": [Math.SQRT1_2, 0, 0, Math.SQRT1_2],
};

const INCH_NAME_PATTERN = /(inch|(^|[^a-z])in([^a-z]|$))/i;

/**
 * guess file units from bounding size and filename hints
 */
export function guessUnits(size: Vec3, fileName: string | null): UnitsGuess {
  const largest = Math.max(size.x, size.y, size.z);
  const baseName = (fileName ?? "").replace(/\.stl$/i, "");

  if (INCH_NAME_PATTERN.test(baseName)) {
    return { units: "inch", note: "The file name suggests inches." };
  }
  if (!(largest > 0) || !Number.isFinite(largest)) {
    return { units: "mm", note: null };
  }
  if (largest < 2) {
    return { units: "m", note: `Largest dimension is ${formatNumber(largest)}. This looks like a part drawn in metres.` };
  }
  if (largest < 60) {
    return { units: "mm", note: `Largest dimension is ${formatNumber(largest)}. If the part was exported in inches, choose inch.` };
  }
  if (largest > 20000) {
    return { units: "mm", note: `Largest dimension is ${formatNumber(largest)}. That is very large for millimetres. Check the units.` };
  }
  return { units: "mm", note: null };
}

/**
 * Shape alone cannot tell Y-up from Z-up: flat plates and long beams fool any aspect-ratio rule.
 * Most CAD exports are Z-up, so that is the guess and the user confirms it on screen.
 * guess up axis, defaulting to +z since shape alone is ambiguous
 */
export function guessUpAxis(_size: Vec3): UpAxis {
  return "+z";
}

/**
 * Bounding-box size in millimetres once the part is in the Z-up job frame.
 * convert a part bounding size to millimetres in the z-up job frame
 */
export function partSizeMm(size: Vec3, units: Units, upAxis: UpAxis): Vec3 {
  const s = MM_PER_UNIT[units];
  return upAxis === "+y" ? { x: size.x * s, y: size.z * s, z: size.y * s } : { x: size.x * s, y: size.y * s, z: size.z * s };
}

/**
 * format a dimension compactly for unit guess notes
 */
function formatNumber(v: number): string {
  return v >= 100 ? v.toFixed(0) : v.toPrecision(3);
}
