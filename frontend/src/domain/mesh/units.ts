import type { Vec3 } from "./primitives";

export type Units = "mm" | "cm" | "m" | "inch";

export type UnitsGuess = { units: Units; note: string | null };

const INCH_NAME_PATTERN = /(inch|(^|[^a-z])in([^a-z]|$))/i;

export function guessUnits(size: Vec3, fileName: string | null): UnitsGuess {
  const largest = Math.max(size.x, size.y, size.z);
  const baseName = (fileName ?? "").replace(/\.stl$/i, "");

  if (INCH_NAME_PATTERN.test(baseName)) {
    return { units: "inch", note: "The file name suggests inches." };
  }
  if (!(largest > 0) || !isFinite(largest)) {
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

function formatNumber(v: number): string {
  return v >= 100 ? v.toFixed(0) : v.toPrecision(3);
}
