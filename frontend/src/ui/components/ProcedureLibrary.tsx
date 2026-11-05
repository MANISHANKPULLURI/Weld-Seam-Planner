import { PROCESS_K } from "@weld/core";
import type { Procedure } from "@weld/core";
import { useState } from "react";
import { useStore } from "../../state/store";
import { NumberField } from "./NumberField";

export const PROCESS_LABEL: Record<number, string> = { 135: "MAG 135", 131: "MIG 131", 136: "FCAW 136", 141: "TIG 141" };

const PROCESSES: Procedure["process"][] = [
  { kind: "gmaw", iso_4063: 135 }, { kind: "gmaw", iso_4063: 131 }, { kind: "fcaw", iso_4063: 136 }, { kind: "gtaw", iso_4063: 141 },
];

/**
 * summarize a procedure as process, current and speed
 */
export function procedureSummary(p: Procedure) {
  return `${PROCESS_LABEL[p.process.iso_4063]} · ${p.electrical.current_a} A · ${p.electrical.voltage_v} V · ${p.motion.travel_speed_mm_min} mm/min`;
}

/**
 * edit the procedure library and pick the active one
 */
export function ProcedureLibrary({ activeId, onActive }: { activeId: string; onActive: (id: string) => void }) {
  const procedures = useStore((s) => s.procedures);
  const seams = useStore((s) => s.seams);
  const { saveProcedure, duplicateProcedure, deleteProcedure, resetProcedures } = useStore.getState();
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <section className="result-card">
      <header className="result-header">
        <span className="result-title">Procedures</span>
      </header>
      <p className="result-explainer">A procedure is a saved set of weld settings (process, wire, gas, current, voltage, speed). Pick one, then apply it to seams below. The EXAMPLE ones are starting points only: use the values from your welding procedure (WPS).</p>

      <ul className="proc-list">
        {procedures.map((p) => {
          const used = seams.filter((x) => x.weld?.procedureId === p.id).length;
          return (
            <li key={p.id} className={`proc-row${p.id === activeId ? " proc-row-active" : ""}`}>
              <button type="button" className="proc-row-main" onClick={() => onActive(p.id)} aria-pressed={p.id === activeId}>
                <span className="proc-radio" aria-hidden="true" />
                <span className="proc-text">
                  <span className="proc-name">{p.name}</span>
                  <span className="proc-meta numeric">{procedureSummary(p)}{used ? ` · ${used} seam${used === 1 ? "" : "s"}` : ""}</span>
                </span>
              </button>
              <span className="proc-actions">
                <button type="button" className="btn-link" onClick={() => setEditing(editing === p.id ? null : p.id)}>{editing === p.id ? "Done" : "Edit"}</button>
                <button type="button" className="btn-link" onClick={() => { const id = duplicateProcedure(p.id); if (useStore.getState().procedures.some((x) => x.id === id)) { onActive(id); setEditing(id); } else setError(id); }}>Copy</button>
                <button type="button" className="btn-link btn-danger" onClick={() => setError(deleteProcedure(p.id))}>Delete</button>
              </span>
              {editing === p.id && <ProcedureForm procedure={p} onChange={saveProcedure} />}
            </li>
          );
        })}
      </ul>
      {error && <p className="result-danger-text" role="alert">{error}</p>}
      <p className="field-hint">Your procedures are saved in this browser. <button type="button" className="btn-link" onClick={resetProcedures}>Restore examples</button> brings back the EXAMPLE set (ones in use are kept).</p>
    </section>
  );
}

/**
 * edit every field of one welding procedure
 */
function ProcedureForm({ procedure: p, onChange }: { procedure: Procedure; onChange: (p: Procedure) => void }) {
  /**
   * patch the procedure being edited
   */
  const set = (patch: Partial<Procedure>) => onChange({ ...p, ...patch });
  /**
   * use a numeric input or its fallback default
   */
  const num = (v: number | null, fallback: number) => (v === null || !(v >= 0) ? fallback : v);
  const hi = p.limits.heat_input_kj_mm;

  return (
    <div className="proc-form">
      <label className="field field-wide">
        <span className="field-label">Name</span>
        <input className="field-control" value={p.name} onChange={(e) => set({ name: e.target.value })} />
      </label>
      <label className="field field-wide">
        <span className="field-label">Process</span>
        <select className="field-control" value={p.process.iso_4063} onChange={(e) => {
          const process = PROCESSES.find((x) => x.iso_4063 === Number(e.target.value))!;
          set({ process, thermal_efficiency_k: PROCESS_K[process.kind], electrical: { ...p.electrical, wire_feed_speed_m_min: process.kind === "gtaw" ? null : p.electrical.wire_feed_speed_m_min ?? 8 } });
        }}>
          {PROCESSES.map((x) => <option key={x.iso_4063} value={x.iso_4063}>{PROCESS_LABEL[x.iso_4063]}</option>)}
        </select>
      </label>
      <div className="field-grid">
        <NumberField label="Current" unit="A" value={p.electrical.current_a} onChange={(v) => set({ electrical: { ...p.electrical, current_a: num(v, 1) } })} />
        <NumberField label="Voltage" unit="V" step={0.5} value={p.electrical.voltage_v} onChange={(v) => set({ electrical: { ...p.electrical, voltage_v: num(v, 1) } })} />
        <NumberField label="Travel speed" unit="mm/min" step={10} value={p.motion.travel_speed_mm_min} onChange={(v) => set({ motion: { travel_speed_mm_min: num(v, 1) } })} />
        {p.process.kind !== "gtaw" && <NumberField label="Wire feed" unit="m/min" step={0.5} value={p.electrical.wire_feed_speed_m_min} onChange={(v) => set({ electrical: { ...p.electrical, wire_feed_speed_m_min: v } })} />}
        <NumberField label="Wire" unit="mm" step={0.1} value={p.wire.diameter_mm} onChange={(v) => set({ wire: { diameter_mm: num(v, 0.1) } })} />
        <NumberField label="Gas flow" unit="l/min" value={p.gas.flow_l_min} onChange={(v) => set({ gas: { ...p.gas, flow_l_min: v } })} />
        <NumberField label="Efficiency k" step={0.05} value={p.thermal_efficiency_k} hint="Share of arc energy that heats the part: 0.8 MAG/MIG/FCAW, 0.6 TIG." onChange={(v) => set({ thermal_efficiency_k: Math.min(1, num(v, 0.1)) })} />
        <label className="field">
          <span className="field-label">Gas</span>
          <input className="field-control" value={p.gas.name} onChange={(e) => set({ gas: { ...p.gas, name: e.target.value } })} />
        </label>
        <NumberField label="Heat input min" unit="kJ/mm" step={0.1} value={hi.min} onChange={(v) => set({ limits: { ...p.limits, heat_input_kj_mm: { ...hi, min: v } } })} />
        <NumberField label="Heat input max" unit="kJ/mm" step={0.1} value={hi.max} onChange={(v) => set({ limits: { ...p.limits, heat_input_kj_mm: { ...hi, max: v } } })} />
        <NumberField label="Max throat per pass" unit="mm" step={0.5} value={p.limits.max_throat_per_pass_mm} hint="Bigger welds get a warning to add passes. Empty = no check." onChange={(v) => set({ limits: { ...p.limits, max_throat_per_pass_mm: v } })} />
        <NumberField label="Travel speed min" unit="mm/min" step={10} value={p.limits.travel_speed_mm_min?.min ?? null} onChange={(v) => set({ limits: { ...p.limits, travel_speed_mm_min: { min: v, max: p.limits.travel_speed_mm_min?.max ?? null } } })} />
        <NumberField label="Travel speed max" unit="mm/min" step={10} value={p.limits.travel_speed_mm_min?.max ?? null} onChange={(v) => set({ limits: { ...p.limits, travel_speed_mm_min: { min: p.limits.travel_speed_mm_min?.min ?? null, max: v } } })} />
      </div>
      <p className="field-hint">New seams given this procedure start with:</p>
      <div className="field-grid">
        <label className="field">
          <span className="field-label">Size given as</span>
          <select className="field-control" value={p.seam_defaults.weld_size.basis} onChange={(e) => set({ seam_defaults: { ...p.seam_defaults, weld_size: { ...p.seam_defaults.weld_size, basis: e.target.value as "a" | "z" } } })}>
            <option value="a">a, throat</option>
            <option value="z">z, leg</option>
          </select>
        </label>
        <NumberField label="Weld size" unit="mm" step={0.5} value={p.seam_defaults.weld_size.value_mm} onChange={(v) => set({ seam_defaults: { ...p.seam_defaults, weld_size: { ...p.seam_defaults.weld_size, value_mm: num(v, 0.5) } } })} />
        <NumberField label="Travel angle" unit="°" min={-30} value={p.seam_defaults.travel_angle_deg} onChange={(v) => set({ seam_defaults: { ...p.seam_defaults, travel_angle_deg: v ?? 0 } })} />
        <NumberField label="Stick-out" unit="mm" value={p.seam_defaults.stick_out_mm} onChange={(v) => set({ seam_defaults: { ...p.seam_defaults, stick_out_mm: v ?? 0 } })} />
      </div>
    </div>
  );
}
