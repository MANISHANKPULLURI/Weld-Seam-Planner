import { useMemo, useRef, useState } from "react";
import { sealWeldJob, weldJobSchema } from "@weld/core";
import type { WeldJob } from "@weld/core";
import { orderedSeams, previewJob, useStore } from "../../state/store";
import { formatTime } from "../components/WeldSeamList";
import { StepNav } from "../components/StepNav";
import { PROCESS_LABEL } from "../components/ProcedureLibrary";

/**
 * review totals, checks and export the weld job
 */
export function ReviewStep() {
  const state = useStore();
  const { setJob, selectSeam, setStep, importJob } = useStore.getState();
  const draft = useMemo(() => previewJob(state), [state]);
  const [message, setMessage] = useState<string | null>(null);
  const [showJson, setShowJson] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);
  const { errors, warnings } = draft.validation;
  const blocked = errors.length > 0;

  
  /**
   * go to the step a validation issue points at
   */
  const jump = (path: string) => {
    const index = Number(path.split("/")[2]);
    const id = Number.isFinite(index) ? orderedSeams(useStore.getState())[index]?.id : null;
    if (id) { setStep("procedures"); selectSeam(id); }
    else if (path === "/job/name") document.getElementById("job-name")?.focus();
  };

  /**
   * compile and seal the final weld job
   */
  async function sealed(): Promise<WeldJob> {
    return sealWeldJob(previewJob(useStore.getState()));
  }

  /**
   * download the sealed weld job as JSON
   */
  async function download() {
    const job = await sealed();
    const blob = new Blob([JSON.stringify(job, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${job.job.name.replace(/[^\w.-]+/g, "_") || "weld_job"}.weldjob.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMessage(`Downloaded ${a.download}.`);
  }

  /**
   * copy the sealed weld job JSON to the clipboard
   */
  async function copy() {
    try {
      await navigator.clipboard.writeText(JSON.stringify(await sealed(), null, 2));
      setMessage("Copied the weld job JSON.");
    } catch {
      setMessage("Copy failed in this browser. Use Download JSON instead.");
    }
  }

  /**
   * import and validate a weld job file
   */
  async function onImport(file: File) {
    try {
      const parsed = weldJobSchema.safeParse(JSON.parse(await file.text()));
      if (!parsed.success) { setMessage(`Not a valid weld job: ${parsed.error.issues[0]?.path.join(".")} ${parsed.error.issues[0]?.message}`); return; }
      setMessage(importJob(parsed.data));
    } catch {
      setMessage("That file is not JSON.");
    }
  }

  return (
    <div className="seams-stack">
      <section className="result-card">
        <header className="result-header"><span className="result-title">Weld job</span></header>
        <label className="field field-wide">
          <span className="field-label">Name</span>
          <input id="job-name" className="field-control" value={state.job.name} placeholder={draft.job.name} onChange={(e) => setJob({ name: e.target.value })} />
        </label>
        <label className="field field-wide">
          <span className="field-label">Notes</span>
          <textarea className="field-control job-notes" rows={2} value={state.job.notes} onChange={(e) => setJob({ notes: e.target.value })} />
        </label>
        <div className="field-grid">
          <label className="field">
            <span className="field-label">Status</span>
            <select className="field-control" value={state.job.status} onChange={(e) => setJob({ status: e.target.value as "draft" | "approved" })}>
              <option value="draft">Draft (arc off)</option>
              <option value="approved">Approved (arc on)</option>
            </select>
          </label>
          <label className="field">
            <span className="field-label">Supervision</span>
            <select className="field-control" value={state.job.supervision} onChange={(e) => setJob({ supervision: e.target.value as "operator_confirm" | "auto" })}>
              <option value="operator_confirm">Operator confirms each seam</option>
              <option value="auto">Automatic</option>
            </select>
          </label>
          <label className="field">
            <span className="field-label">Waypoint spacing (mm)</span>
            <input className="field-control numeric" type="number" min={0.5} step={1} value={state.job.waypointSpacingMm} onChange={(e) => setJob({ waypointSpacingMm: Math.max(0.5, Number(e.target.value) || 5) })} />
          </label>
        </div>
      </section>

      <dl className="weld-totals weld-totals-4">
        <div><dt>Seams</dt><dd className="numeric">{draft.totals.seam_count}</dd></div>
        <div><dt>Weld length</dt><dd className="numeric">{draft.totals.total_length_mm.toFixed(0)} mm</dd></div>
        <div><dt>Arc time</dt><dd className="numeric">{formatTime(draft.totals.arc_time_s)}</dd></div>
        <div><dt>Cycle</dt><dd className="numeric">{formatTime(draft.totals.estimated_cycle_time_s)}</dd></div>
      </dl>

      <section className="result-card" aria-label="Checks">
        <header className="result-header">
          <span className="result-title">Checks</span>
          <span className={blocked ? "result-danger-text" : "result-explainer"}>{errors.length} error{errors.length === 1 ? "" : "s"}, {warnings.length} warning{warnings.length === 1 ? "" : "s"}</span>
        </header>
        {errors.length + warnings.length === 0 && <p className="result-explainer">Everything checks out.</p>}
        <ul className="issue-list">
          {[...errors, ...warnings].map((issue, k) => (
            <li key={`${issue.path}-${issue.code}-${k}`}>
              <button type="button" className={`issue issue-${issue.severity}`} onClick={() => jump(issue.path)} title="Show this">
                <span className="issue-badge">{issue.severity === "error" ? "Error" : "Warning"}</span>
                <span>{issue.message}</span>
              </button>
            </li>
          ))}
        </ul>
        {blocked && <p className="result-explainer">Fix the errors to export. Click one to go to it.</p>}
      </section>

      <section className="result-card" aria-label="What will be exported">
        <header className="result-header"><span className="result-title">Exported per seam</span></header>
        {draft.seams.length === 0 ? <p className="result-explainer">No seams with a procedure yet.</p> : (
          <div className="export-table-wrap">
            <table className="export-table">
              <thead><tr><th>#</th><th>Seam</th><th>Process</th><th>A</th><th>V</th><th>mm/min</th><th>Size</th><th>Pos.</th><th>kJ/mm</th><th>Arc</th><th>Points</th></tr></thead>
              <tbody>
                {draft.seams.map((x) => {
                  const p = draft.procedures.find((q) => q.id === x.procedure_ref);
                  return (
                    <tr key={x.id}>
                      <td className="numeric">{x.sequence}</td>
                      <td>{x.name}</td>
                      <td>{p ? PROCESS_LABEL[p.process.iso_4063] : "?"}</td>
                      <td className="numeric">{x.effective.current_a}</td>
                      <td className="numeric">{x.effective.voltage_v}</td>
                      <td className="numeric">{x.effective.travel_speed_mm_min}</td>
                      <td className="numeric">{x.weld_size.basis}{x.weld_size.value_mm}{x.weld_size.passes > 1 ? ` ×${x.weld_size.passes}` : ""}{x.intermittent ? " stitch" : ""}</td>
                      <td>{x.weld_position.iso_6947}</td>
                      <td className="numeric">{x.derived.heat_input_kj_mm.toFixed(2)}</td>
                      <td className="numeric">{formatTime(x.derived.arc_time_s)}</td>
                      <td className="numeric">{x.geometry.waypoints.length}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="field-hint">Each seam also carries torch angles, stick-out, approach/retract, its waypoints (position, direction, surface normals, torch axis, contact tip, tool orientation), heat input and arc time. Field meanings are in the README.</p>
      </section>

      <section className="result-card">
        <div className="result-actions result-actions-split">
          <button type="button" className="btn-primary" disabled={blocked} onClick={download}title="Saves a .weldjob.json file">Download JSON</button>
          <button type="button" className="btn-secondary" disabled={blocked} onClick={copy}>Copy JSON</button>
        </div>
        <button type="button" className="btn-link" onClick={() => setShowJson((v) => !v)}>{showJson ? "Hide" : "Preview"} JSON</button>
        {showJson && <pre className="json-preview">{JSON.stringify(draft, null, 2).slice(0, 60000)}</pre>}
        <button type="button" className="btn-link" onClick={() => fileRef.current?.click()}>Import a weld job…</button>
        <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void onImport(f); e.target.value = ""; }} />
        {message && <p className="result-explainer" role="status">{message}</p>}
      </section>
      <StepNav />
    </div>
  );
}
