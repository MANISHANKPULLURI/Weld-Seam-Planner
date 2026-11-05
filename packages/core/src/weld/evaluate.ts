import { MM_PER_UNIT } from "../mesh/units.ts";
import type { Units, UpAxis } from "../mesh/units.ts";
import type { Procedure } from "../schema/procedure.ts";
import type { JointType, SeamPath } from "../seams/types.ts";
import { arcEnergyKjMm, arcTimeS, filletSizes, seamPosition } from "./calc.ts";
import type { Aws, Intermittent, Iso6947, WeldSize } from "./calc.ts";


export type SeamWeld = {
  procedureId: string;
  overrides: Partial<{ voltage_v: number; current_a: number; wire_feed_speed_m_min: number; travel_speed_mm_min: number }>;
  size: WeldSize;
  passes: number;
  intermittent: Intermittent | null;
  torch: { work_angle_offset_deg: number; travel_angle_deg: number; stick_out_mm: number };
  start: { approach_mm: number; run_in_mm: number };
  end: { retract_mm: number; crater_fill: boolean };
  position: Iso6947 | null;
};

export type WeldableSeam = SeamPath & { id: string; name: string; jointType: JointType; angleDeg: number; weld?: SeamWeld };

export type Issue = { code: string; message: string };

export type SeamEvaluation = {
  procedure: Procedure | null;
  voltage: number; current: number; travel: number; wireFeed: number | null;
  lengthMm: number; arcEnergy: number; heatInput: number; arcTime: number;
  throat: number; leg: number;
  position: { iso: Iso6947; aws: Aws; source: "derived" | "user" };
  warnings: Issue[];
};


/**
 * create default weld settings from a procedure preset
 */
export function defaultWeld(procedure: Procedure): SeamWeld {
  const d = procedure.seam_defaults;
  return {
    procedureId: procedure.id, overrides: {}, size: { ...d.weld_size }, passes: 1, intermittent: null,
    torch: { work_angle_offset_deg: 0, travel_angle_deg: d.travel_angle_deg, stick_out_mm: d.stick_out_mm },
    start: { approach_mm: 20, run_in_mm: 0 }, end: { retract_mm: 20, crater_fill: true }, position: null,
  };
}

const ISO_TO_AWS: Record<Iso6947, { fillet: Aws; groove: Aws }> = {
  PA: { fillet: "1F", groove: "1G" }, PB: { fillet: "2F", groove: "2G" }, PC: { fillet: "2F", groove: "2G" },
  PD: { fillet: "4F", groove: "4G" }, PE: { fillet: "4F", groove: "4G" }, PF: { fillet: "3F", groove: "3G" },
  PG: { fillet: "3F", groove: "3G" }, inclined: { fillet: "inclined", groove: "inclined" },
};

/**
 * evaluate a seam against procedures to compute energy, time and warnings
 */
export function evaluateSeam(seam: WeldableSeam, procedures: Procedure[], units: Units, upAxis: UpAxis): SeamEvaluation | null {
  const w = seam.weld;
  if (!w) return null;
  const procedure = procedures.find((p) => p.id === w.procedureId) ?? null;
  const voltage = w.overrides.voltage_v ?? procedure?.electrical.voltage_v ?? 0;
  const current = w.overrides.current_a ?? procedure?.electrical.current_a ?? 0;
  const travel = w.overrides.travel_speed_mm_min ?? procedure?.motion.travel_speed_mm_min ?? 0;
  const wireFeed = w.overrides.wire_feed_speed_m_min ?? procedure?.electrical.wire_feed_speed_m_min ?? null;
  const lengthMm = seam.length * MM_PER_UNIT[units];
  const arcEnergy = arcEnergyKjMm(voltage, current, travel);
  const heatInput = arcEnergy * (procedure?.thermal_efficiency_k ?? 0);
  const { a: throat, z: leg } = filletSizes(w.size, seam.angleDeg > 0 ? 180 - seam.angleDeg : 90);
  const derived = seamPosition(seam.points, seam.normalsA, seam.normalsB, upAxis, seam.jointType);
  const position = w.position
    ? { iso: w.position, aws: ISO_TO_AWS[w.position][seam.jointType === "butt" ? "groove" : "fillet"], source: "user" as const }
    : { ...derived, source: "derived" as const };

  const warnings: Issue[] = [];
  const warn = (code: string, message: string) => warnings.push({ code, message });
  if (!procedure) warn("seam.procedure_missing", "The procedure was deleted. Pick another.");
  const hi = procedure?.limits.heat_input_kj_mm;
  if (hi?.min != null && heatInput < hi.min) warn("seam.heat_below_limit", `Heat input ${heatInput.toFixed(2)} kJ/mm is below the procedure minimum ${hi.min}.`);
  if (hi?.max != null && heatInput > hi.max) warn("seam.heat_above_limit", `Heat input ${heatInput.toFixed(2)} kJ/mm is above the procedure maximum ${hi.max}.`);
  const ts = procedure?.limits.travel_speed_mm_min;
  if (ts?.min != null && travel < ts.min) warn("seam.travel_below_limit", `Travel speed ${travel} mm/min is below the procedure minimum ${ts.min}.`);
  if (ts?.max != null && travel > ts.max) warn("seam.travel_above_limit", `Travel speed ${travel} mm/min is above the procedure maximum ${ts.max}.`);
  if (w.intermittent && w.intermittent.pitch_mm < w.intermittent.weld_length_mm) warn("seam.stitch_pitch", "Stitch pitch is shorter than the stitch length.");
  if (w.intermittent && lengthMm < w.intermittent.weld_length_mm) warn("seam.stitch_too_long", "Seam is shorter than one stitch, so it is welded fully.");
  if (position.iso === "PG" && procedure?.process.kind === "fcaw") warn("seam.position_process", "Vertical down is usually avoided with flux-cored wire.");
  const perPass = procedure?.limits.max_throat_per_pass_mm;
  if (perPass != null && throat / w.passes > perPass) warn("seam.throat_per_pass", `Throat ${throat.toFixed(1)} mm in ${w.passes} pass${w.passes === 1 ? "" : "es"} exceeds ${perPass} mm per pass for this procedure; add passes.`);

  return { procedure, voltage, current, travel, wireFeed, lengthMm, arcEnergy, heatInput, arcTime: arcTimeS(lengthMm, travel, w.passes, w.intermittent), throat, leg, position, warnings };
}
