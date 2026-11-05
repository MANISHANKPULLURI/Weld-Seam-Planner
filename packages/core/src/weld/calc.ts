import type { UpAxis } from "../mesh/units.ts";
import type { Procedure } from "../schema/procedure.ts";

export type Iso6947 = "PA" | "PB" | "PC" | "PD" | "PE" | "PF" | "PG" | "inclined";
export type Aws = "1G" | "1F" | "2G" | "2F" | "3G" | "3F" | "4G" | "4F" | "inclined";
export type WeldSize = { basis: "a" | "z"; value_mm: number };
export type Intermittent = { weld_length_mm: number; pitch_mm: number };


export const EXAMPLE_PROCEDURES: Procedure[] = [
  {
    id: "proc_mag135", name: "EXAMPLE MAG 135, steel, 1.0 mm wire", process: { kind: "gmaw", iso_4063: 135 },
    wire: { diameter_mm: 1.0 }, gas: { name: "Ar + 18% CO2", flow_l_min: 14 },
    electrical: { voltage_v: 22, current_a: 200, wire_feed_speed_m_min: 8 }, motion: { travel_speed_mm_min: 400 },
    thermal_efficiency_k: 0.8, limits: { heat_input_kj_mm: { min: 0.5, max: 1.5 }, travel_speed_mm_min: { min: 200, max: 900 }, max_throat_per_pass_mm: 6 },
    seam_defaults: { weld_size: { basis: "a", value_mm: 4 }, travel_angle_deg: 10, stick_out_mm: 15 },
  },
  {
    id: "proc_mig131", name: "EXAMPLE MIG 131, aluminium, 1.2 mm wire", process: { kind: "gmaw", iso_4063: 131 },
    wire: { diameter_mm: 1.2 }, gas: { name: "Argon", flow_l_min: 18 },
    electrical: { voltage_v: 21, current_a: 170, wire_feed_speed_m_min: 9 }, motion: { travel_speed_mm_min: 500 },
    thermal_efficiency_k: 0.8, limits: { heat_input_kj_mm: { min: 0.3, max: 1.0 }, travel_speed_mm_min: { min: 300, max: 1000 }, max_throat_per_pass_mm: 5 },
    seam_defaults: { weld_size: { basis: "a", value_mm: 4 }, travel_angle_deg: 10, stick_out_mm: 15 },
  },
  {
    id: "proc_fcaw136", name: "EXAMPLE FCAW 136, steel, 1.2 mm cored wire", process: { kind: "fcaw", iso_4063: 136 },
    wire: { diameter_mm: 1.2 }, gas: { name: "Ar + 18% CO2", flow_l_min: 16 },
    electrical: { voltage_v: 26, current_a: 230, wire_feed_speed_m_min: 9 }, motion: { travel_speed_mm_min: 350 },
    thermal_efficiency_k: 0.8, limits: { heat_input_kj_mm: { min: 0.6, max: 2.0 }, travel_speed_mm_min: { min: 200, max: 700 }, max_throat_per_pass_mm: 8 },
    seam_defaults: { weld_size: { basis: "a", value_mm: 5 }, travel_angle_deg: -10, stick_out_mm: 20 },
  },
  {
    id: "proc_tig141", name: "EXAMPLE TIG 141, stainless", process: { kind: "gtaw", iso_4063: 141 },
    wire: { diameter_mm: 1.6 }, gas: { name: "Argon", flow_l_min: 10 },
    electrical: { voltage_v: 12, current_a: 140, wire_feed_speed_m_min: null }, motion: { travel_speed_mm_min: 150 },
    thermal_efficiency_k: 0.6, limits: { heat_input_kj_mm: { min: 0.3, max: 1.2 }, travel_speed_mm_min: { min: 80, max: 300 }, max_throat_per_pass_mm: 3 },
    seam_defaults: { weld_size: { basis: "a", value_mm: 3 }, travel_angle_deg: 10, stick_out_mm: 8 },
  },
];

export const PROCESS_K: Record<Procedure["process"]["kind"], number> = { gmaw: 0.8, fcaw: 0.8, gtaw: 0.6 };


/**
 * compute arc energy in kj per mm from voltage, current and travel speed
 */
export function arcEnergyKjMm(voltageV: number, currentA: number, travelMmMin: number): number {
  return travelMmMin > 0 ? (voltageV * currentA * 60) / (1000 * travelMmMin) : 0;
}


/**
 * compute welded length accounting for intermittent stitch pattern
 */
export function weldedLengthMm(lengthMm: number, intermittent: Intermittent | null): number {
  if (!intermittent) return lengthMm;
  const { weld_length_mm: w, pitch_mm: p } = intermittent;
  if (w <= 0 || p <= 0 || lengthMm <= w) return lengthMm;
  const count = Math.floor((lengthMm - w) / Math.max(p, w)) + 1;
  return Math.min(lengthMm, count * w);
}

/**
 * compute arc time in seconds from length, travel speed and passes
 */
export function arcTimeS(lengthMm: number, travelMmMin: number, passes = 1, intermittent: Intermittent | null = null): number {
  return travelMmMin > 0 ? (weldedLengthMm(lengthMm, intermittent) / travelMmMin) * 60 * Math.max(1, passes) : 0;
}


/**
 * convert between fillet throat and leg sizes for a joint opening
 */
export function filletSizes(size: WeldSize, openingDeg = 90): { a: number; z: number } {
  const f = Math.cos(((openingDeg / 2) * Math.PI) / 180);
  return size.basis === "a" ? { a: size.value_mm, z: size.value_mm / f } : { a: size.value_mm * f, z: size.value_mm };
}

/**
 * map part coordinates to z-up job coordinates for an up axis
 */
export function toZUp(v: [number, number, number], upAxis: UpAxis): [number, number, number] {
  return upAxis === "+y" ? [v[0], -v[2], v[1]] : v;
}

const deg = (r: number) => (r * 180) / Math.PI;
const unit = (v: number[]) => { const l = Math.hypot(v[0]!, v[1]!, v[2]!) || 1; return [v[0]! / l, v[1]! / l, v[2]! / l]; };






/**
 * classify weld position from travel direction and surface normals
 */
export function weldPosition(direction: [number, number, number], normalA: [number, number, number], normalB: [number, number, number], joint: "fillet" | "butt" | "corner" | "unknown"): { iso: Iso6947; aws: Aws } {

  const d = unit(direction);
  const slope = deg(Math.asin(Math.min(1, Math.abs(d[2]!))));
  const fillet = joint !== "butt";

  if (slope > 45) {
    const iso: Iso6947 = d[2]! > 0 ? "PF" : "PG";
    return { iso, aws: fillet ? "3F" : "3G" };
  }

  const face = unit([normalA[0] + normalB[0], normalA[1] + normalB[1], normalA[2] + normalB[2]]);
  const fromUp = deg(Math.acos(Math.max(-1, Math.min(1, face[2]!))));

  if (fillet) {
    if (fromUp < 30) return { iso: "PA", aws: "1F" };
    if (fromUp < 80) return { iso: "PB", aws: "2F" };
    if (fromUp <= 100) return { iso: "PC", aws: "2F" };
    if (fromUp <= 150) return { iso: "PD", aws: "4F" };
    return { iso: "PE", aws: "4F" };
  }
  if (fromUp < 30) return { iso: "PA", aws: "1G" };
  if (fromUp >= 60 && fromUp <= 120) return { iso: "PC", aws: "2G" };
  if (fromUp > 150) return { iso: "PE", aws: "4G" };
  return { iso: "inclined", aws: "inclined" };
}


/**
 * derive weld position from seam midpoint direction and normals
 */
export function seamPosition(points: Float32Array, normalsA: Float32Array, normalsB: Float32Array, upAxis: UpAxis, joint: "fillet" | "butt" | "corner" | "unknown") {
  const n = points.length / 3;
  const i = Math.max(0, Math.floor((n - 1) / 2));
  const j = Math.min(n - 1, i + 1);
  const v = (a: Float32Array, k: number): [number, number, number] => [a[k * 3]!, a[k * 3 + 1]!, a[k * 3 + 2]!];
  const dir: [number, number, number] = [points[j * 3]! - points[i * 3]!, points[j * 3 + 1]! - points[i * 3 + 1]!, points[j * 3 + 2]! - points[i * 3 + 2]!];
  return weldPosition(toZUp(dir, upAxis), toZUp(v(normalsA, i), upAxis), toZUp(v(normalsB, i), upAxis), joint);
}
