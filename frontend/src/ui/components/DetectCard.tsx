import { MM_PER_UNIT } from "@weld/core";
import { useStore } from "../../state/store";
import { detectSeams } from "../../lib/meshClient";

export function DetectCard() {
  const settings = useStore((s) => s.detectSettings);
  const detection = useStore((s) => s.detection);
  const units = useStore((s) => s.frame.units);
  const candidates = useStore((s) => s.seams.filter((x) => x.status === "candidate").length);
  const setSettings = useStore((s) => s.setDetectSettings);
  const running = detection.status === "running";

  // Settings are entered in mm; detection works in file units.
  function run() {
    const scale = MM_PER_UNIT[units];
    detectSeams({ featureAngleDeg: settings.featureAngleDeg, minLength: settings.minLengthMm / scale, contactTolerance: settings.gapMm / scale, includeOutside: settings.includeOutside });
  }

  const status = running ? "Looking for seams…"
    : detection.status === "error" ? detection.error
    : detection.status === "done" ? (candidates === 0 ? "No new candidates. Try a lower angle or add seams with Edge chain or Draw." : `${candidates} candidate${candidates === 1 ? "" : "s"} to review.`)
    : "Finds inside corners, plates that touch and parts that intersect.";

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
          <label className="field">
            <span className="field-label">Bend angle (°)</span>
            <input className="field-control" type="number" min={5} max={90} step={5} value={settings.featureAngleDeg} onChange={(e) => setSettings({ featureAngleDeg: clamp(Number(e.target.value), 5, 90) })} />
          </label>
          <label className="field">
            <span className="field-label">Min length (mm)</span>
            <input className="field-control" type="number" min={0} step={1} value={settings.minLengthMm} onChange={(e) => setSettings({ minLengthMm: clamp(Number(e.target.value), 0, 1e6) })} />
          </label>
          <label className="field">
            <span className="field-label">Gap tolerance (mm)</span>
            <input className="field-control" type="number" min={0.001} max={5} step={0.05} value={settings.gapMm} onChange={(e) => setSettings({ gapMm: clamp(Number(e.target.value), 0.001, 5) })} />
          </label>
          <label className="field field-check">
            <input type="checkbox" checked={settings.includeOutside} onChange={(e) => setSettings({ includeOutside: e.target.checked })} />
            <span>Outside corners</span>
          </label>
        </div>
      </details>

      <button type="button" className="btn-primary btn-block" onClick={run} disabled={running}>
        {detection.status === "idle" ? "Detect seams" : "Detect again"}
      </button>
    </section>
  );
}

function clamp(v: number, lo: number, hi: number) {
  return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : lo;
}
