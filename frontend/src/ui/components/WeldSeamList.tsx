import { useState } from "react";
import { inWorkArea, seamCalc, useStore } from "../../state/store";
import { PROCESS_LABEL } from "./ProcedureLibrary";
import { POSITION_LABEL } from "../labels";
import { seamColor } from "../../viewer/seamColors";

/**
 * format seconds as minutes or seconds
 */
export function formatTime(s: number) {
  return s >= 60 ? `${Math.floor(s / 60)} min ${Math.round(s % 60)} s` : `${s.toFixed(1)} s`;
}

/**
 * list accepted seams with procedures and totals
 */
export function WeldSeamList({ activeId }: { activeId: string }) {
  const all = useStore((s) => s.seams);
  const workArea = useStore((s) => s.workArea);
  const procedures = useStore((s) => s.procedures);
  const frame = useStore((s) => s.frame);
  const selectedId = useStore((s) => s.selectedSeamId);
  const { assignProcedure, selectSeam } = useStore.getState();
  const [checked, setChecked] = useState<string[]>([]);

  const seams = all.filter((x) => x.status === "accepted" && inWorkArea(x, workArea));
  const active = procedures.find((p) => p.id === activeId);
  const without = seams.filter((x) => !x.weld);
  const calcs = new Map(seams.map((x) => [x.id, seamCalc(x, procedures, frame.units, frame.upAxis)]));
  const totalTime = [...calcs.values()].reduce((t, c) => t + (c?.arcTime ?? 0), 0);
  const totalLength = seams.reduce((t, x) => t + (calcs.get(x.id)?.lengthMm ?? 0), 0);
  const issues = [...calcs.values()].reduce((n, c) => n + (c?.warnings.length ?? 0), 0);
  /**
   * select or deselect a seam for bulk actions
   */
  const toggle = (id: string) => setChecked((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));
  const short = active ? PROCESS_LABEL[active.process.iso_4063] : "";

  if (seams.length === 0) {
    return <p className="seam-empty">No seams yet. Go back to Seams and keep (✓) the welds first.</p>;
  }

  return (
    <section className="seam-section" aria-label="Seam weld settings">
      <header className="seam-section-header">
        <span className="section-label">Seams <span className="numeric">{seams.length}</span>{without.length > 0 && <span className="weld-missing"> · {without.length} without a procedure</span>}</span>
        <label className="weld-check-all">
          <input type="checkbox" checked={checked.length === seams.length} onChange={(e) => setChecked(e.target.checked ? seams.map((x) => x.id) : [])} />
          All
        </label>
      </header>

      <div className="weld-apply">
        <button type="button" className="btn-primary" disabled={!active || checked.length === 0} onClick={() => { assignProcedure(checked, activeId); setChecked([]); }}>
          Apply {short} to {checked.length || "ticked"} seam{checked.length === 1 ? "" : "s"}
        </button>
        {without.length > 0 && (
          <button type="button" className="btn-secondary" disabled={!active} onClick={() => assignProcedure(without.map((x) => x.id), activeId)}>
            Apply to the {without.length} without one
          </button>
        )}
      </div>

      <ul className="seam-rows weld-rows">
        {seams.map((x) => {
          const c = calcs.get(x.id);
          return (
            <li key={x.id} className={`seam-row weld-row${x.id === selectedId ? " seam-row-selected" : ""}`}>
              <input type="checkbox" className="weld-row-check" checked={checked.includes(x.id)} onChange={() => toggle(x.id)} aria-label={`Tick ${x.name}`} />
              <button type="button" className="weld-row-main" onClick={() => selectSeam(x.id === selectedId ? null : x.id)} aria-pressed={x.id === selectedId}>
                <span className="weld-row-top">
                  <span className="seam-swatch" style={{ background: seamColor(x) }} aria-hidden="true" />
                  <span className="seam-row-name">{x.name}</span>
                  <span className="seam-row-meta">{c?.procedure ? PROCESS_LABEL[c.procedure.process.iso_4063] : "No procedure"}</span>
                  {c && c.warnings.length > 0 && <span className="weld-warn-dot" title={c.warnings.map((w) => w.message).join("\n")}>!</span>}
                  <span className="seam-row-length numeric">{(c?.lengthMm ?? 0).toFixed(0)} mm</span>
                </span>
                {c && (
                  <span className="weld-row-sub numeric">
                    a{c.throat.toFixed(1)} · {c.position.iso} · {c.heatInput.toFixed(2)} kJ/mm · {formatTime(c.arcTime)}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>

      <dl className="weld-totals">
        <div><dt>Weld length</dt><dd className="numeric">{totalLength.toFixed(0)} mm</dd></div>
        <div><dt>Arc time</dt><dd className="numeric">{formatTime(totalTime)}</dd></div>
        <div><dt>Warnings</dt><dd className="numeric">{issues}</dd></div>
      </dl>
    </section>
  );
}
