import { useState } from "react";
import { seamLengthMm, useStore } from "../../state/store";
import type { Seam } from "../../state/store";

// Split with a live preview: one cut placed by slider, mm box or by moving along the seam on the part,
// or N equal parts. Nothing changes until "Split".
export function SplitPanel({ seam }: { seam: Seam }) {
  const units = useStore((s) => s.frame.units);
  const cuts = useStore((s) => s.splitCuts) ?? [];
  const { setSplitCuts, splitSeamAt, setPendingAction } = useStore.getState();
  const [mode, setMode] = useState<"one" | "equal">(cuts.length > 1 ? "equal" : "one");
  const [parts, setParts] = useState(Math.max(2, cuts.length + 1));
  const length = seamLengthMm(seam, units);
  const at = cuts[0] ?? length / 2;
  const round = (v: number) => Math.round(v * 10) / 10;

  const even = (n: number) => Array.from({ length: n - 1 }, (_, i) => round((length * (i + 1)) / n));
  const pieces = seam.closed && mode === "one" ? [length] : [...cuts, length].map((c, i, all) => c - (i === 0 ? 0 : all[i - 1]!));

  return (
    <div className="split-panel" role="group" aria-label="Split seam">
      <div className="view-segmented split-mode" role="group" aria-label="Split mode">
        <button type="button" aria-pressed={mode === "one"} onClick={() => { setMode("one"); setSplitCuts([round(at)]); }}>One cut</button>
        <button type="button" aria-pressed={mode === "equal"} onClick={() => { setMode("equal"); setSplitCuts(even(parts)); }}>Equal parts</button>
      </div>

      {mode === "one" ? (
        <>
          <input className="split-range" type="range" min={0} max={length} step={0.1} value={at} onChange={(e) => setSplitCuts([round(Number(e.target.value))])} aria-label="Cut position" />
          <label className="split-mm">
            Cut at
            <input className="field-control numeric" type="number" min={0.1} max={length - 0.1} step={0.5} value={round(at)} onChange={(e) => setSplitCuts([Math.min(length - 0.1, Math.max(0.1, Number(e.target.value) || 0))])} />
            mm from the start dot
          </label>
          <p className="field-hint">Or move along the seam on the part: the cut follows the cursor. Click there to split.</p>
        </>
      ) : (
        <label className="split-mm">
          Cut into
          <input className="field-control numeric" type="number" min={2} max={50} step={1} value={parts} onChange={(e) => { const n = Math.min(50, Math.max(2, Math.round(Number(e.target.value) || 2))); setParts(n); setSplitCuts(even(n)); }} />
          equal parts
        </label>
      )}

      <p className="split-readout numeric">
        {seam.closed && mode === "one" ? `The loop opens at the cut and stays one seam of ${round(length)} mm.` : pieces.map((p, i) => `${i === 0 ? seam.name : `new ${i}`}: ${round(p)} mm`).join("  |  ")}
      </p>

      <div className="result-actions result-actions-split">
        <button type="button" className="btn-secondary" onClick={() => setPendingAction(null)}>Cancel</button>
        <button type="button" className="btn-primary" onClick={() => splitSeamAt(seam.id, cuts)}>Split</button>
      </div>
    </div>
  );
}
