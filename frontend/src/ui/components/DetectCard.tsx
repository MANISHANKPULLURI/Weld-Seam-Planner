import { autoMinLengthMm, useStore } from "../../state/store";
import { detectWithSettings, detectionScope } from "../../lib/meshClient";
import { NumberField } from "./NumberField";

/**
 * detect seams and tune the detection settings
 */
export function DetectCard() {
  const settings = useStore((s) => s.detectSettings);
  const detection = useStore((s) => s.detection);
  const autoMin = useStore((s) => autoMinLengthMm(s.health, s.frame.units));
  const candidates = useStore((s) => s.seams.filter((x) => x.status === "candidate").length);
  const setSettings = useStore((s) => s.setDetectSettings);
  const scope = useStore((s) => detectionScope(s.workArea?.label ?? null, s.hiddenBodies.length));
  const running = detection.status === "running";
  const where = detection.scope ? ` ${detection.scope}` : "";

  const status = running ? "Looking for seams…"
    : detection.status === "error" ? detection.error
    : detection.status === "done" ? (candidates === 0 ? `No new candidates${where}. Lower the bend angle, or add seams with Pick edge or Draw.` : `${candidates} candidate${candidates === 1 ? "" : "s"}${where} to review below.`)
    : "Suggests seams at inside corners, where plates touch, and where parts pass through each other. You review each one.";

  return (
    <section className="result-card">
      <header className="result-header">
        <span className="result-title">Find seams</span>
        {running && <span className="spinner" aria-hidden="true" />}
      </header>
      <p className={detection.status === "error" ? "result-danger-text" : "result-explainer"} role="status">{status}</p>

      <details className="disclosure">
        <summary>Detection settings</summary>
        <div className="field-grid">
          <NumberField label="Min bend" unit="°" step={5} min={5} value={settings.featureAngleDeg} hint="How sharp a corner must be. 90° is a right angle." onChange={(v) => setSettings({ featureAngleDeg: clamp(v ?? 5, 5, 120) })} />
          <NumberField label="Min length" unit="mm" step={1} min={0} placeholder={`Auto (${autoMin})`} value={settings.minLengthMm} hint="Ignore seams shorter than this." onChange={(v) => setSettings({ minLengthMm: v === null ? null : clamp(v, 0, 1e6) })} />
          <NumberField label="Gap tolerance" unit="mm" step={0.05} min={0.001} value={settings.gapMm} hint="Max gap for two parts to count as touching." onChange={(v) => setSettings({ gapMm: clamp(v ?? 0.001, 0.001, 5) })} />
          <label className="field field-check" title="Also suggest outside edges, for corner joints welded from outside.">
            <input type="checkbox" checked={settings.includeOutside} onChange={(e) => setSettings({ includeOutside: e.target.checked })} />
            <span>Outside corners</span>
          </label>
        </div>
      </details>

      <p className="result-explainer detect-scope">
        {scope ? `Searches only ${scope}. Choose Whole model and show all parts to search everything.` : "Searches the whole model. To work on one area, cut a Section and choose Work here only, or hide parts."}
      </p>
      {detection.status === "done" && candidates > 0 && (
        <button type="button" className="btn-primary btn-block" onClick={() => useStore.getState().setReviewing(true)} title="See each suggestion up close and keep or drop it">
          Review {candidates} one by one
        </button>
      )}
      <button type="button" className={`${detection.status === "done" && candidates > 0 ? "btn-secondary" : "btn-primary"} btn-block`} onClick={detectWithSettings} disabled={running}>
        {scope ? "Detect in this area" : detection.status === "idle" ? "Detect seams" : "Detect again"}
      </button>
    </section>
  );
}

/**
 * clamp a setting into its valid range
 */
function clamp(v: number, lo: number, hi: number) {
  return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : lo;
}
