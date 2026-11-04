import { useEffect, useRef } from "react";
import type { Iso6947 } from "@weld/core";
import { seamCalc, useStore } from "../../state/store";
import type { SeamWeld } from "../../state/store";
import { NumberField } from "./NumberField";
import { focusForSeam } from "../../lib/focus";
import { POSITION_LABEL, formatTime } from "./WeldSeamList";

const POSITIONS: Iso6947[] = ["PA", "PB", "PC", "PD", "PE", "PF", "PG"];

export function WeldInspector() {
  const seam = useStore((s) => s.seams.find((x) => x.id === s.selectedSeamId && x.status === "accepted"));
  const procedures = useStore((s) => s.procedures);
  const frame = useStore((s) => s.frame);
  const { assignProcedure, updateWeld, selectSeam } = useStore.getState();
  const ref = useRef<HTMLElement>(null);
  useEffect(() => { ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }); }, [seam?.id]);

  if (!seam) return null;

  const w = seam.weld;
  const c = seamCalc(seam, procedures, frame.units, frame.upAxis);
  const update = (patch: Partial<SeamWeld>) => updateWeld([seam.id], patch);
  const override = (key: keyof SeamWeld["overrides"], v: number | null) => {
    const next = { ...w!.overrides };
    if (v === null) delete next[key]; else next[key] = v;
    update({ overrides: next });
  };
  const proc = c?.procedure;

  return (
    <section ref={ref} className="result-card weld-inspector" aria-label={`Weld settings for ${seam.name}`}>
      <header className="result-header">
        <span className="result-title">{seam.name}{c ? ` · ${c.lengthMm.toFixed(1)} mm` : ""}</span>
        <span className="seam-head-actions">
          <button type="button" className="btn-link" onClick={() => { const mesh = useStore.getState().mesh; if (mesh) useStore.getState().setFocus(focusForSeam(mesh, seam)); }} title="Zoom to this seam and fade parts it does not touch">Focus</button>
          <button type="button" className="btn-link" onClick={() => selectSeam(null)}>Close</button>
        </span>
      </header>

      <label className="field field-wide">
        <span className="field-label">Procedure</span>
        <select className="field-control" value={w?.procedureId ?? ""} onChange={(e) => assignProcedure([seam.id], e.target.value)}>
          {!w && <option value="" disabled>Choose a procedure</option>}
          {procedures.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </label>

      {!w || !c ? <p className="result-explainer">Choose a procedure to set this seam's weld parameters.</p> : (
        <>
          <div className="weld-results" role="status">
            <div><span>Heat input</span><strong className="numeric">{c.heatInput.toFixed(2)} kJ/mm</strong></div>
            <div><span>Arc time</span><strong className="numeric">{formatTime(c.arcTime)}</strong></div>
            <div><span>Position</span><strong>{c.position.iso} / {c.position.aws}</strong></div>
          </div>
          <p className="result-explainer">
            Heat input = k × voltage × current × 60 / (1000 × travel speed) = {proc?.thermal_efficiency_k} × {c.arcEnergy.toFixed(2)} kJ/mm arc energy.
            Position {c.position.iso} is {POSITION_LABEL[c.position.iso]}{c.position.source === "derived" ? ", worked out from the seam direction and surfaces (Z up)" : ", set by you"}.
          </p>
          {c.warnings.length > 0 && <ul className="weld-warnings">{c.warnings.map((m) => <li key={m.code}>{m.message}</li>)}</ul>}

          <details className="disclosure" open>
            <summary>Weld size</summary>
            <div className="field-grid">
              <label className="field" title="a = throat thickness (ISO 2553, Europe). z = leg length (AWS, USA).">
                <span className="field-label">Size given as</span>
                <select className="field-control" value={w.size.basis} onChange={(e) => update({ size: { ...w.size, basis: e.target.value as "a" | "z" } })}>
                  <option value="a">a, throat</option>
                  <option value="z">z, leg</option>
                </select>
              </label>
              <NumberField label="Size" unit="mm" step={0.5} value={w.size.value_mm} onChange={(v) => v && update({ size: { ...w.size, value_mm: v } })} />
              <NumberField label="Passes" step={1} min={1} value={w.passes} onChange={(v) => v && update({ passes: Math.round(v) })} />
            </div>
            <p className="field-hint">Throat a {c.throat.toFixed(1)} mm, leg z {c.leg.toFixed(1)} mm (a = z × cos(opening/2), 0.707 at 90°).</p>
            <label className="field field-check">
              <input type="checkbox" checked={!!w.intermittent} onChange={(e) => update({ intermittent: e.target.checked ? { weld_length_mm: 50, pitch_mm: 150 } : null })} />
              <span>Stitch weld (short welds with gaps)</span>
            </label>
            {w.intermittent && (
              <div className="field-grid">
                <NumberField label="Stitch length" unit="mm" value={w.intermittent.weld_length_mm} onChange={(v) => v && update({ intermittent: { ...w.intermittent!, weld_length_mm: v } })} />
                <NumberField label="Pitch" unit="mm" hint="Start of one stitch to the start of the next." value={w.intermittent.pitch_mm} onChange={(v) => v && update({ intermittent: { ...w.intermittent!, pitch_mm: v } })} />
              </div>
            )}
          </details>

          <details className="disclosure">
            <summary>Parameters for this seam</summary>
            <p className="field-hint">Empty or Reset uses the procedure value.</p>
            <div className="field-grid">
              <NumberField label="Current" unit="A" value={c.current} overridden={w.overrides.current_a != null} onReset={() => override("current_a", null)} onChange={(v) => override("current_a", v)} />
              <NumberField label="Voltage" unit="V" step={0.5} value={c.voltage} overridden={w.overrides.voltage_v != null} onReset={() => override("voltage_v", null)} onChange={(v) => override("voltage_v", v)} />
              <NumberField label="Travel speed" unit="mm/min" step={10} value={c.travel} overridden={w.overrides.travel_speed_mm_min != null} onReset={() => override("travel_speed_mm_min", null)} onChange={(v) => override("travel_speed_mm_min", v)} />
              {proc?.process.kind !== "gtaw" && <NumberField label="Wire feed" unit="m/min" step={0.5} value={c.wireFeed} overridden={w.overrides.wire_feed_speed_m_min != null} onReset={() => override("wire_feed_speed_m_min", null)} onChange={(v) => override("wire_feed_speed_m_min", v)} />}
            </div>
          </details>

          <details className="disclosure">
            <summary>Torch</summary>
            <div className="field-grid">
              <NumberField label="Work angle offset" unit="°" min={-45} value={w.torch.work_angle_offset_deg} hint="Tilt sideways from the middle of the corner. 0 points straight into it." onChange={(v) => update({ torch: { ...w.torch, work_angle_offset_deg: v ?? 0 } })} />
              <NumberField label="Travel angle" unit="°" min={-30} value={w.torch.travel_angle_deg} hint="Lean along the seam. Positive pushes, negative drags." onChange={(v) => update({ torch: { ...w.torch, travel_angle_deg: v ?? 0 } })} />
              <NumberField label="Stick-out" unit="mm" value={w.torch.stick_out_mm} hint="Contact tip to work distance (CTWD)." onChange={(v) => update({ torch: { ...w.torch, stick_out_mm: v ?? 0 } })} />
            </div>
          </details>

          <details className="disclosure">
            <summary>Start, end and position</summary>
            <div className="field-grid">
              <NumberField label="Approach" unit="mm" value={w.start.approach_mm} hint="Distance the torch comes in from." onChange={(v) => update({ start: { ...w.start, approach_mm: v ?? 0 } })} />
              <NumberField label="Retract" unit="mm" value={w.end.retract_mm} hint="Distance the torch backs away after." onChange={(v) => update({ end: { ...w.end, retract_mm: v ?? 0 } })} />
              <label className="field field-check">
                <input type="checkbox" checked={w.end.crater_fill} onChange={(e) => update({ end: { ...w.end, crater_fill: e.target.checked } })} />
                <span>Crater fill at the end</span>
              </label>
              <label className="field">
                <span className="field-label">Position</span>
                <select className="field-control" value={w.position ?? ""} onChange={(e) => update({ position: (e.target.value || null) as Iso6947 | null })}>
                  <option value="">Automatic ({c.position.source === "derived" ? c.position.iso : "derived"})</option>
                  {POSITIONS.map((p) => <option key={p} value={p}>{p}, {POSITION_LABEL[p]}</option>)}
                </select>
              </label>
            </div>
          </details>
        </>
      )}
    </section>
  );
}
