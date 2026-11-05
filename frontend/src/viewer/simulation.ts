

export type SimSegment =
  | { kind: "arc"; id: string; points: Float32Array; normalsA: Float32Array; normalsB: Float32Array; closed: boolean; duration: number; cumulative: number[] }
  | { kind: "air"; from: [number, number, number]; to: [number, number, number]; duration: number };

export type SimPose = { point: [number, number, number]; axis: [number, number, number]; welding: boolean; segment: number; fraction: number };

/**
 * build a timed weld segment with cumulative lengths
 */
export function arcSegment(id: string, points: Float32Array, normalsA: Float32Array, normalsB: Float32Array, closed: boolean, duration: number): SimSegment {
  const n = points.length / 3, cumulative = [0];
  const count = closed ? n + 1 : n;
  for (let i = 1; i < count; i++) {
    const a = (i - 1) % n, b = i % n;
    cumulative.push(cumulative[i - 1]! + Math.hypot(points[b * 3]! - points[a * 3]!, points[b * 3 + 1]! - points[a * 3 + 1]!, points[b * 3 + 2]! - points[a * 3 + 2]!));
  }
  return { kind: "arc", id, points, normalsA, normalsB, closed, duration, cumulative };
}

/**
 * sum the durations of all simulation segments
 */
export function totalDuration(segments: SimSegment[]) {
  return segments.reduce((t, s) => t + s.duration, 0);
}

/**
 * normalize a vector to unit length
 */
const unit = (v: number[]): [number, number, number] => { const l = Math.hypot(v[0]!, v[1]!, v[2]!) || 1; return [v[0]! / l, v[1]! / l, v[2]! / l]; };

/**
 * find the torch pose at a simulation time
 */
export function poseAt(segments: SimSegment[], t: number): SimPose | null {
  let start = 0;
  for (let k = 0; k < segments.length; k++) {
    const s = segments[k]!;
    if (t <= start + s.duration || k === segments.length - 1) {
      const f = s.duration > 0 ? Math.min(1, Math.max(0, (t - start) / s.duration)) : 1;
      if (s.kind === "air") {
        return { point: [0, 1, 2].map((a) => s.from[a]! + (s.to[a]! - s.from[a]!) * f) as [number, number, number], axis: [0, 0, -1], welding: false, segment: k, fraction: f };
      }
      const length = s.cumulative[s.cumulative.length - 1]!;
      const d = f * length;
      let i = 0;
      while (i < s.cumulative.length - 2 && s.cumulative[i + 1]! < d) i++;
      const n = s.points.length / 3, a = i % n, b = (i + 1) % n;
      const seg = s.cumulative[i + 1]! - s.cumulative[i]! || 1, u = (d - s.cumulative[i]!) / seg;
      const point = [0, 1, 2].map((c) => s.points[a * 3 + c]! + (s.points[b * 3 + c]! - s.points[a * 3 + c]!) * u) as [number, number, number];
      const axis = unit([0, 1, 2].map((c) => -(s.normalsA[a * 3 + c]! + s.normalsB[a * 3 + c]!)));
      return { point, axis, welding: true, segment: k, fraction: f };
    }
    start += s.duration;
  }
  return null;
}


/**
 * cut an arc segment at the welded fraction
 */
export function weldedPart(s: Extract<SimSegment, { kind: "arc" }>, f: number): Float32Array {
  const length = s.cumulative[s.cumulative.length - 1]!, d = f * length, n = s.points.length / 3;
  const out: number[] = [];
  for (let i = 0; i < s.cumulative.length; i++) {
    const idx = i % n;
    if (s.cumulative[i]! <= d) { out.push(s.points[idx * 3]!, s.points[idx * 3 + 1]!, s.points[idx * 3 + 2]!); continue; }
    const prev = (i - 1) % n, seg = s.cumulative[i]! - s.cumulative[i - 1]! || 1, u = (d - s.cumulative[i - 1]!) / seg;
    for (let c = 0; c < 3; c++) out.push(s.points[prev * 3 + c]! + (s.points[idx * 3 + c]! - s.points[prev * 3 + c]!) * u);
    break;
  }
  return new Float32Array(out);
}
