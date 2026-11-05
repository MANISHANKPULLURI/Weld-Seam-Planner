import { useState } from "react";
import { seamLengthMm, useStore } from "../../state/store";
import type { Seam } from "../../state/store";
import { NumberField } from "./NumberField";



/**
 * choose where to split the selected seam
 */
export function SplitPanel({ seam }: { seam: Seam }) {
  const units = useStore((s) => s.frame.units);
  const cuts = useStore((s) => s.splitCuts) ?? [];
  const { setSplitCuts, splitSeamAt, setPendingAction } = useStore.getState();
  const [mode, setMode] = useState<"one" | "equal">(cuts.length > 1 ? "equal" : "one");
  const [parts, setParts] = useState(Math.max(2, cuts.length + 1));
  const length = seamLengthMm(seam, units);
  const at = cuts[0] ?? length / 2;
  /**
   * round a cut distance to a tenth of a millimetre
   */
  const round = (v: number) => Math.round(v * 10) / 10;

  /**
   * space cuts evenly along the seam length
   */
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
            <NumberField inline label="Cut at" unit="mm" step={0.5} min={0.1} value={round(at)} onChange={(v) => setSplitCuts([Math.min(length - 0.1, Math.max(0.1, v ?? 0))])} />
            mm from the start dot
          </label>
          <p className="field-hint">Or move along the seam on the part: the cut follows the cursor. Click there to split.</p>
        </>
      ) : (
        <label className="split-mm">
          Cut into
          <NumberField inline label="Cut into" step={1} min={2} value={parts} onChange={(v) => { const n = Math.min(50, Math.max(2, Math.round(v ?? 2))); setParts(n); setSplitCuts(even(n)); }} />
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
