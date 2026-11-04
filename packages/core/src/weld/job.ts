import { Matrix4, Quaternion, Vector3 } from "three";
import { MM_PER_UNIT, UP_AXIS_QUATERNION_XYZW } from "../mesh/units.ts";
import type { Units, UpAxis } from "../mesh/units.ts";
import type { Procedure } from "../schema/procedure.ts";
import type { Seam as JobSeam } from "../schema/seam.ts";
import type { Waypoint } from "../schema/waypoint.ts";
import type { WeldJob } from "../schema/weldJob.ts";
import { toZUp } from "./calc.ts";
import { evaluateSeam } from "./evaluate.ts";
import type { Issue, WeldableSeam } from "./evaluate.ts";
import { airTravel } from "./sequence.ts";

export const TOOL_VERSION = "0.1.0";

export type JobInput = {
  meta: { id?: string; name: string; notes: string; status: "draft" | "approved"; createdAt?: string };
  part: { filename: string; sha256: string | null; triangles: number; min: [number, number, number]; max: [number, number, number]; repaired: boolean };
  units: Units;
  upAxis: UpAxis;
  procedures: Procedure[];
  seams: (WeldableSeam & { waitAfterS: number })[]; // already in execution order and direction
  airSpeedMmS: number;
  waypointSpacingMm: number;
  supervision: "operator_confirm" | "auto";
};

type V = [number, number, number];
const round = (v: number, d = 4) => Math.round(v * 10 ** d) / 10 ** d;
const r3 = (v: V | number[]): V => [round(v[0]!), round(v[1]!), round(v[2]!)];

// File coordinates to job frame: millimetres, Z up.
function toJob(v: V, units: Units, upAxis: UpAxis): V {
  const s = MM_PER_UNIT[units];
  const z = toZUp(v, upAxis);
  return [z[0] * s, z[1] * s, z[2] * s];
}

const norm = (v: Vector3) => (v.lengthSq() > 0 ? v.normalize() : v.set(0, 0, 1));

// Torch frame at a point: z points from the torch into the weld (opposite the corner bisector),
// tilted sideways by the work-angle offset (about the tangent) and along the seam by the travel
// angle (positive = push: the torch leans back so it points forward).
export function torchFrame(tangent: V, normalA: V, normalB: V, workOffsetDeg: number, travelDeg: number) {
  const t = norm(new Vector3(...tangent));
  const bis = norm(new Vector3(...normalA).add(new Vector3(...normalB)));
  const z = bis.clone().negate();
  z.applyAxisAngle(t, (workOffsetDeg * Math.PI) / 180);
  const side = norm(new Vector3().crossVectors(z, t));
  z.applyAxisAngle(side, (travelDeg * Math.PI) / 180);
  norm(z);
  const x = norm(t.clone().sub(z.clone().multiplyScalar(t.dot(z))));
  const y = new Vector3().crossVectors(z, x);
  const q = new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(x, y, z));
  return { axis: [z.x, z.y, z.z] as V, quaternion: [q.x, q.y, q.z, q.w] as [number, number, number, number] };
}

export function waypointsFor(seam: WeldableSeam, units: Units, upAxis: UpAxis, spacingMm: number, torch: { work_angle_offset_deg: number; travel_angle_deg: number; stick_out_mm: number }): Waypoint[] {
  const n = seam.points.length / 3;
  const pts: V[] = [], nA: V[] = [], nB: V[] = [];
  for (let i = 0; i < n; i++) {
    pts.push(toJob([seam.points[i * 3]!, seam.points[i * 3 + 1]!, seam.points[i * 3 + 2]!], units, upAxis));
    nA.push(toZUp([seam.normalsA[i * 3]!, seam.normalsA[i * 3 + 1]!, seam.normalsA[i * 3 + 2]!], upAxis));
    nB.push(toZUp([seam.normalsB[i * 3]!, seam.normalsB[i * 3 + 1]!, seam.normalsB[i * 3 + 2]!], upAxis));
  }
  if (seam.closed) { pts.push(pts[0]!); nA.push(nA[0]!); nB.push(nB[0]!); }

  const cumulative = [0];
  for (let i = 1; i < pts.length; i++) cumulative.push(cumulative[i - 1]! + Math.hypot(...pts[i]!.map((v, k) => v - pts[i - 1]![k]!) as V));
  const total = cumulative[cumulative.length - 1]!;
  const count = Math.max(1, Math.ceil(total / Math.max(0.1, spacingMm)));
  const out: Waypoint[] = [];

  for (let k = 0; k <= count; k++) {
    const s = (total * k) / count;
    let i = 0;
    while (i < pts.length - 2 && cumulative[i + 1]! < s) i++;
    const seg = cumulative[i + 1]! - cumulative[i]!;
    const f = seg > 0 ? (s - cumulative[i]!) / seg : 0;
    const p = pts[i]!.map((v, a) => v + (pts[i + 1]![a]! - v) * f) as V;
    const tangent = pts[i + 1]!.map((v, a) => v - pts[i]![a]!) as V;
    const near = f < 0.5 ? i : i + 1;
    const frame = torchFrame(tangent, nA[near]!, nB[near]!, torch.work_angle_offset_deg, torch.travel_angle_deg);
    const tl = Math.hypot(...tangent) || 1;
    out.push({
      s_mm: round(s, 3),
      position_mm: r3(p),
      tangent: r3(tangent.map((v) => v / tl)),
      surface_normals: [r3(nA[near]!), r3(nB[near]!)],
      torch_axis: r3(frame.axis),
      contact_tip_mm: r3(p.map((v, a) => v - frame.axis[a]! * torch.stick_out_mm)),
      tool_quaternion_xyzw: frame.quaternion.map((v) => round(v, 6)) as [number, number, number, number],
    });
  }
  return out;
}

export type JobIssue = Issue & { path: string; seamId?: string };

// Rules that decide whether a job can be exported (errors) or needs a look (warnings).
export function validateJob(input: JobInput): { errors: JobIssue[]; warnings: JobIssue[] } {
  const errors: JobIssue[] = [], warnings: JobIssue[] = [];
  if (input.seams.length === 0) errors.push({ path: "/seams", code: "job.no_seams", message: "There are no seams to weld." });
  if (!input.meta.name.trim()) errors.push({ path: "/job/name", code: "job.no_name", message: "Give the job a name." });
  if (!input.part.sha256) warnings.push({ path: "/part/sha256", code: "part.no_hash", message: "The part file could not be fingerprinted, so the job can't be matched to it later." });
  input.seams.forEach((seam, i) => {
    const path = `/seams/${i}`;
    if (!seam.weld) { errors.push({ path, seamId: seam.id, code: "seam.no_procedure", message: `${seam.name} has no procedure.` }); return; }
    const e = evaluateSeam(seam, input.procedures, input.units, input.upAxis);
    if (!e?.procedure) { errors.push({ path, seamId: seam.id, code: "seam.procedure_missing", message: `${seam.name}: its procedure no longer exists.` }); return; }
    if (e.lengthMm <= 0) errors.push({ path, seamId: seam.id, code: "seam.zero_length", message: `${seam.name} has no length.` });
    if (e.travel <= 0 || e.current <= 0 || e.voltage <= 0) errors.push({ path, seamId: seam.id, code: "seam.bad_parameters", message: `${seam.name}: current, voltage and travel speed must be above zero.` });
    for (const w of e.warnings) warnings.push({ path, seamId: seam.id, code: w.code, message: `${seam.name}: ${w.message}` });
  });
  return { errors, warnings };
}

export function jobTotals(input: JobInput) {
  const evals = input.seams.map((s) => evaluateSeam(s, input.procedures, input.units, input.upAxis));
  const scale = MM_PER_UNIT[input.units];
  const ends = input.seams.map((s) => {
    const n = s.points.length / 3;
    const p = (i: number) => toJob([s.points[i * 3]!, s.points[i * 3 + 1]!, s.points[i * 3 + 2]!], input.units, input.upAxis);
    return { start: p(0), end: s.closed ? p(0) : p(n - 1), closed: s.closed };
  });
  const between = airTravel(ends, ends.map((_, i) => i), ends.map(() => false));
  const approach = input.seams.reduce((t, s) => t + (s.weld ? s.weld.start.approach_mm + s.weld.end.retract_mm : 0), 0);
  const air = between + approach;
  const arc = evals.reduce((t, e) => t + (e?.arcTime ?? 0), 0);
  const wait = input.seams.reduce((t, s, i) => t + (i < input.seams.length - 1 ? s.waitAfterS : 0), 0);
  const airTime = input.airSpeedMmS > 0 ? air / input.airSpeedMmS : 0;
  return {
    seam_count: input.seams.length,
    total_length_mm: round(input.seams.reduce((t, s) => t + s.length * scale, 0), 2),
    arc_time_s: round(arc, 2),
    air_travel_mm: round(air, 1),
    air_time_s: round(airTime, 2),
    wait_time_s: round(wait, 2),
    estimated_cycle_time_s: round(arc + airTime + wait, 2),
  };
}

export function compileWeldJob(input: JobInput): Omit<WeldJob, "integrity"> {
  const created = input.meta.createdAt ?? new Date().toISOString();
  const id = input.meta.id ?? `job_${created.slice(0, 16).replace(/[-:T]/g, "").replace(/^(\d{8})(\d{4})$/, "$1_$2")}_${Math.random().toString(36).slice(2, 4)}`;
  const usedProcedures = input.procedures.filter((p) => input.seams.some((s) => s.weld?.procedureId === p.id));
  const scale = MM_PER_UNIT[input.units];
  const minJob = toJob(input.part.min, input.units, input.upAxis), maxJob = toJob(input.part.max, input.units, input.upAxis);

  const seams: JobSeam[] = input.seams.flatMap((seam, i) => {
    const e = evaluateSeam(seam, input.procedures, input.units, input.upAxis);
    const w = seam.weld;
    if (!w || !e?.procedure) return [];
    const single = seam.normalsA.every((v, k) => Math.abs(v - seam.normalsB[k]!) < 1e-6);
    return [{
      id: seam.id,
      name: seam.name,
      sequence: i + 1,
      operation: "weld" as const,
      joint: { type: seam.jointType, dihedral_deg: round(seam.angleDeg, 1), concavity: "concave" as const, type_source: seam.jointType === "unknown" ? "user" as const : "detected" as const },
      weld_position: { iso_6947: e.position.iso, aws: e.position.aws, source: e.position.source },
      direction: "forward" as const,
      procedure_ref: w.procedureId,
      overrides: { ...w.overrides },
      effective: { voltage_v: e.voltage, current_a: e.current, wire_feed_speed_m_min: e.wireFeed, travel_speed_mm_min: e.travel },
      torch: { work_angle_offset_deg: w.torch.work_angle_offset_deg, travel_angle_deg: w.torch.travel_angle_deg, travel_angle_convention: "positive_push" as const, stick_out_mm: w.torch.stick_out_mm },
      start: { ...w.start },
      end: { ...w.end },
      weld_size: { basis: w.size.basis, value_mm: w.size.value_mm, passes: w.passes },
      intermittent: w.intermittent ? { ...w.intermittent } : null,
      wait_after_s: seam.waitAfterS,
      supervision: input.supervision,
      inspection: null,
      geometry: { length_mm: round(seam.length * scale, 3), frame_source: single ? "single_surface" as const : "two_surfaces" as const, waypoints: waypointsFor(seam, input.units, input.upAxis, input.waypointSpacingMm, w.torch) },
      derived: { arc_energy_kj_mm: round(e.arcEnergy, 4), heat_input_kj_mm: round(e.heatInput, 4), arc_time_s: round(e.arcTime, 2) },
      access: { status: "not_checked" as const, method: null },
      checks: { torch_clearance: "ok" as const },
    }];
  });

  const { errors, warnings } = validateJob(input);

  return {
    schema_version: "1.0.0",
    job: {
      id, name: input.meta.name, created_at: created, tool: { name: "armatrix-weld-planner", version: TOOL_VERSION },
      status: input.meta.status, notes: input.meta.notes,
      execution: { arc_enabled: input.meta.status === "approved", default_supervision: input.supervision, air_speed_mm_s: input.airSpeedMmS, waypoint_spacing_mm: input.waypointSpacingMm },
    },
    frame: {
      units: "mm", handedness: "right", up_axis: "+z", gravity: [0, 0, -1],
      part_to_job: { scale_to_mm: scale, translation_mm: [0, 0, 0], rotation_quaternion_xyzw: UP_AXIS_QUATERNION_XYZW[input.upAxis] },
    },
    part: {
      filename: input.part.filename, sha256: input.part.sha256, triangle_count: input.part.triangles,
      bbox_mm: { min: r3(minJob.map((v, k) => Math.min(v, maxJob[k]!))), max: r3(maxJob.map((v, k) => Math.max(v, minJob[k]!))) },
      repaired: input.part.repaired,
    },
    procedures: usedProcedures,
    access: { entry_ports: [], arm: { reach_mm: null, tip_diameter_mm: null } },
    seams,
    totals: jobTotals(input),
    validation: {
      errors: errors.map(({ path, code, message }) => ({ path, code, severity: "error" as const, message })),
      warnings: warnings.map(({ path, code, message }) => ({ path, code, severity: "warning" as const, message })),
    },
  };
}

// Canonical form for hashing: keys sorted at every level, no whitespace (RFC 8785 style; numbers
// are already rounded when the job is built).
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== undefined).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
}

export async function sealWeldJob(job: Omit<WeldJob, "integrity">): Promise<WeldJob> {
  const bytes = new TextEncoder().encode(canonicalJson(job));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hex = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
  return { ...job, integrity: { content_sha256: hex } };
}

export async function verifyWeldJob(job: WeldJob): Promise<boolean> {
  const { integrity, ...rest } = job;
  return (await sealWeldJob(rest)).integrity.content_sha256 === integrity.content_sha256;
}
