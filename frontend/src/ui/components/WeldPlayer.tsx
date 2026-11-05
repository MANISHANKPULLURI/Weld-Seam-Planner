import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { MM_PER_UNIT } from "@weld/core";
import { orderedSeams, seamCalc, useStore } from "../../state/store";
import type { SceneController } from "../../viewer/SceneController";
import { arcSegment } from "../../viewer/simulation";
import type { SimSegment } from "../../viewer/simulation";
import { formatTime } from "./WeldSeamList";
import { MenuSelect } from "./MenuSelect";

const SPEEDS = [1, 5, 10, 30];


/**
 * play the weld order simulation
 */
export function WeldPlayer({ controller }: { controller: SceneController | null }) {
  const seams = useStore((s) => s.seams);
  const sequence = useStore((s) => s.sequence);
  const procedures = useStore((s) => s.procedures);
  const frame = useStore((s) => s.frame);
  const airSpeed = useStore((s) => s.job.airSpeedMmS);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(10);
  const [progress, setProgress] = useState({ t: 0, total: 0, segment: 0 });

  const { segments, names } = useMemo(() => {
    const list = orderedSeams({ seams, sequence });
    const scale = MM_PER_UNIT[frame.units];
    const out: SimSegment[] = [];
    const labels: string[] = [];
    list.forEach((x, i) => {
      const start: [number, number, number] = [x.points[0]!, x.points[1]!, x.points[2]!];
      if (i > 0) {
        const p = list[i - 1]!, m = p.points.length / 3;
        const end: [number, number, number] = p.closed ? [p.points[0]!, p.points[1]!, p.points[2]!] : [p.points[m * 3 - 3]!, p.points[m * 3 - 2]!, p.points[m * 3 - 1]!];
        const mm = Math.hypot(start[0] - end[0], start[1] - end[1], start[2] - end[2]) * scale;
        out.push({ kind: "air", from: end, to: start, duration: mm / Math.max(1, airSpeed) });
        labels.push(`moving to ${x.name}`);
      }
      const c = seamCalc(x, procedures, frame.units, frame.upAxis);
      const duration = c?.arcTime ?? (x.length * scale) / (400 / 60);
      out.push(arcSegment(x.id, x.points, x.normalsA, x.normalsB, x.closed, duration));
      labels.push(`welding ${x.name} (${i + 1} of ${list.length})${c ? "" : ", no procedure"}`);
    });
    return { segments: out, names: labels };
  }, [seams, sequence, procedures, frame.units, frame.upAxis, airSpeed]);

  useEffect(() => {
    if (!controller) return;
    setPlaying(false);
    controller.setSimulation(segments, (t, total, segment) => {
      setProgress({ t, total, segment });
      if (t >= total) setPlaying(false);
    });
    return () => controller.setSimulation(null);
  }, [controller, segments]);

  if (!segments.length) return null;

  /**
   * play or pause the weld simulation
   */
  const toggle = () => {
    if (!controller) return;
    if (playing) { controller.simPause(); setPlaying(false); }
    else {
      if (progress.t <= 0 || progress.t >= progress.total) controller.fitModel(true);
      controller.simPlay(speed);
      setPlaying(true);
    }
  };

  return (
    <div className="weld-player" role="group" aria-label="Play the weld plan">
      <button type="button" className={`btn-primary weld-player-play${playing ? "" : " weld-player-idle"}`} onClick={toggle} aria-label={playing ? "Pause" : "Play weld"}>{playing ? "❚❚ Pause" : "▶ Play weld"}</button>
      <button type="button" className="view-btn" onClick={() => { controller?.simPause(); controller?.simSeek(0); setPlaying(false); }} aria-label="Back to start">⏮</button>
      <input className="weld-player-range" type="range" min={0} max={progress.total || 1} step={0.01} value={progress.t} onChange={(e) => controller?.simSeek(Number(e.target.value))} aria-label="Position in the weld run" style={{ "--p": `${progress.total ? (progress.t / progress.total) * 100 : 0}%` } as CSSProperties} />
      <span className="weld-player-time numeric">{formatTime(progress.t)} / {formatTime(progress.total)}</span>
      <MenuSelect label="Playback speed" value={String(speed)} onChange={(v) => { const n = Number(v); setSpeed(n); controller?.simSpeed(n); }} options={SPEEDS.map((v) => ({ value: String(v), label: `${v}×` }))} className="menu-select-view" openUp />
      <span className="weld-player-what">{progress.t > 0 ? names[progress.segment] : "Watch the torch weld every seam in order"}</span>
    </div>
  );
}
