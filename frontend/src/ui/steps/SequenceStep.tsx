import { useState } from "react";
import { jobTotals } from "@weld/core";
import { jobInput, orderedSeams, seamCalc, useStore } from "../../state/store";
import { NumberField } from "../components/NumberField";
import { StepNav } from "../components/StepNav";
import { formatTime } from "../components/WeldSeamList";
import { seamColor } from "../../viewer/seamColors";

/**
 * order the welds and set cooling waits
 */
export function SequenceStep() {
  const state = useStore();
  const list = orderedSeams(state);
  const totals = jobTotals(jobInput(state));
  const { moveInSequence, autoOrder, setWait, setJob, reverseSeam, selectSeam } = useStore.getState();
  const [dragId, setDragId] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  if (list.length === 0) return <div className="seams-stack"><p className="seam-empty">No seams yet. Keep (✓) seams in the Seams step first.</p><StepNav /></div>;

  return (
    <div className="seams-stack">
      <section className="result-card seam-guide" aria-label="How this step works">
        <header className="result-header"><span className="result-title">Set the welding order</span></header>
        <ol className="seam-guide-steps">
          <li><span className="seam-guide-num">1</span><span><strong>Auto order</strong> finds a short route and picks each seam's direction, or drag rows to reorder.</span></li>
          <li><span className="seam-guide-num">2</span><span><strong>⇄</strong> swaps a seam's direction. The part shows numbers, arrows and dashed air moves.</span></li>
          <li><span className="seam-guide-num">3</span><span>Add a <strong>wait</strong> after a seam to let it cool (interpass time).</span></li>
        </ol>
      </section>

      <section className="result-card">
        <div className="seq-tools">
          <button type="button" className="btn-primary" onClick={() => { const mm = autoOrder(); setSaved(mm > 0.5 ? `Air travel cut by ${mm.toFixed(0)} mm.` : "Already the shortest route found."); }}>Auto order</button>
          <NumberField label="Air speed" unit="mm/s" step={10} min={1} value={state.job.airSpeedMmS} hint="Torch speed between seams." onChange={(v) => { if (v != null) setJob({ airSpeedMmS: v }); }} />
        </div>
        {saved && <p className="result-explainer" role="status">{saved}</p>}
      </section>

      <ol className="seq-list" aria-label="Welding order">
        {list.map((x, i) => {
          const c = seamCalc(x, state.procedures, state.frame.units, state.frame.upAxis);
          return (
            <li
              key={x.id}
              className={`seq-row${x.id === state.selectedSeamId ? " seam-row-selected" : ""}${dragId === x.id ? " seq-row-drag" : ""}`}
              draggable
              onDragStart={() => setDragId(x.id)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => { if (dragId) moveInSequence(dragId, i); setDragId(null); }}
              onDragEnd={() => setDragId(null)}
            >
              <span className="seq-grip" aria-hidden="true">⋮⋮</span>
              <span className="seq-num numeric">{i + 1}</span>
              <button type="button" className="seq-main" onClick={() => selectSeam(x.id === state.selectedSeamId ? null : x.id)}>
                <span className="seam-row-name"><span className="seam-swatch" style={{ background: seamColor(x) }} aria-hidden="true" /> {x.name}</span>
                <span className="seq-sub numeric">{(c?.lengthMm ?? 0).toFixed(0)} mm · {c ? formatTime(c.arcTime) : "no procedure"}</span>
              </button>
              <button type="button" className="icon-btn" title="Weld the other way" aria-label={`Reverse ${x.name}`} onClick={() => reverseSeam(x.id)} disabled={x.closed}>⇄</button>
              <label className="seq-wait" title="Wait after this seam, seconds">
                <input className="field-control numeric" type="number" min={0} step={5} value={state.waits[x.id] ?? 0} onChange={(e) => setWait(x.id, Number(e.target.value) || 0)} aria-label={`Wait after ${x.name}`} />s
              </label>
              <span className="seq-move">
                <button type="button" className="icon-btn" aria-label={`Move ${x.name} up`} disabled={i === 0} onClick={() => moveInSequence(x.id, i - 1)}>↑</button>
                <button type="button" className="icon-btn" aria-label={`Move ${x.name} down`} disabled={i === list.length - 1} onClick={() => moveInSequence(x.id, i + 1)}>↓</button>
              </span>
            </li>
          );
        })}
      </ol>

      <dl className="weld-totals weld-totals-4">
        <div><dt>Arc</dt><dd className="numeric">{formatTime(totals.arc_time_s)}</dd></div>
        <div><dt>Air moves</dt><dd className="numeric">{formatTime(totals.air_time_s)}</dd><dd className="seq-small numeric">{totals.air_travel_mm.toFixed(0)} mm</dd></div>
        <div><dt>Waits</dt><dd className="numeric">{formatTime(totals.wait_time_s)}</dd></div>
        <div><dt>Cycle</dt><dd className="numeric">{formatTime(totals.estimated_cycle_time_s)}</dd></div>
      </dl>
      <StepNav />
    </div>
  );
}
