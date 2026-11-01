import { useStore } from "../../state/store";
import { CheckIcon, AlertIcon } from "../icons";
import { describeHealth } from "../../domain/mesh/describe";
import { REPAIR_AVAILABLE } from "../../domain/mesh/repair";

export function HealthCard() {
  const health = useStore((s) => s.health);
  const originalHealth = useStore((s) => s.originalHealth);
  const verdict = useStore((s) => s.verdict);
  const repaired = useStore((s) => s.repaired);
  const phase = useStore((s) => s.phase);
  const error = useStore((s) => s.error);
  const loadAnother = useStore((s) => s.loadAnother);
  const setStep = useStore((s) => s.setStep);
  const undoRepair = useStore((s) => s.undoRepair);

  if (phase === "error") {
    return (
      <div className="result-card" role="alert">
        <div className="result-title"><AlertIcon /> Mesh check</div>
        <div className="result-danger-text">{error}</div>
        <div className="result-actions">
          <button type="button" className="btn-primary" onClick={loadAnother}>Try another file</button>
          <button type="button" className="btn-ghost" onClick={async () => { const { createSampleStl } = await import("../../domain/mesh/sample"); const { analyseFile } = await import("../../lib/meshClient"); analyseFile(createSampleStl(), "sample.stl"); }}>Load sample part</button>
        </div>
      </div>
    );
  }

  if (!health || !verdict) return null;

  if (repaired && originalHealth) {
    const download = async () => {
      const state = useStore.getState();
      const buf = state.originalBuffer;
      if (!buf) return;
      const API_BASE = (import.meta as unknown as { env?: { VITE_API_URL?: string } }).env?.VITE_API_URL || "http://localhost:8000";
      const res = await fetch(`${API_BASE}/api/v1/mesh/repair/binary`, { method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: buf });
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const el = document.createElement("a"); el.href = url; el.download = "repaired.stl"; el.click(); URL.revokeObjectURL(url);
    };
    return (
      <div className="result-card">
        <div className="result-title"><CheckIcon /> Mesh check</div>
        <table className="repaired-table">
          <thead><tr><th></th><th>Before</th><th>After</th></tr></thead>
          <tbody>
            <tr><td>Open edges</td><td>{originalHealth.openEdges}</td><td className={originalHealth.openEdges !== health.openEdges ? "changed" : ""}>{originalHealth.openEdges !== health.openEdges ? `→ ${health.openEdges}` : health.openEdges}</td></tr>
            <tr><td>Bodies</td><td>{originalHealth.bodies}</td><td className={originalHealth.bodies !== health.bodies ? "changed" : ""}>{originalHealth.bodies !== health.bodies ? `→ ${health.bodies}` : health.bodies}</td></tr>
            <tr><td>Triangles</td><td>{originalHealth.triangles}</td><td className={originalHealth.triangles !== health.triangles ? "changed" : ""}>{originalHealth.triangles !== health.triangles ? `→ ${health.triangles}` : health.triangles}</td></tr>
          </tbody>
        </table>
        <div className="result-explainer">Repaired copy in use. Your original file is unchanged.</div>
        <div className="result-actions">
          <button type="button" className="btn-primary" onClick={() => setStep("seams")}>Continue to seams</button>
          <button type="button" className="btn-secondary" onClick={download}>Download repaired STL</button>
          <button type="button" className="btn-ghost" onClick={undoRepair}>Undo repair</button>
        </div>
      </div>
    );
  }

  const notes = describeHealth(health);
  const size = health.bounds.size;

  if (verdict === "pass") {
    return (
      <div className="result-card">
        <div className="result-title"><CheckIcon /> Mesh check</div>
        <div className="result-secondary">No structural problems found.</div>
        <div className="result-rows">
          <div className="result-row"><span>Triangles</span><strong className="numeric">{health.triangles}</strong></div>
          <div className="result-row"><span>Bodies</span><strong className="numeric">{health.bodies}</strong></div>
          <div className="result-row"><span>Open edges</span><strong className="numeric">{health.openEdges}</strong></div>
          <div className="result-row"><span>Size</span><strong className="numeric">{size.x.toFixed(2)} × {size.y.toFixed(2)} × {size.z.toFixed(2)} model units</strong></div>
        </div>
        <div className="result-actions">
          <button type="button" className="btn-primary" onClick={() => setStep("seams")}>Continue to seams</button>
          <button type="button" className="btn-secondary" onClick={loadAnother}>Load another</button>
        </div>
      </div>
    );
  }

  return (
    <div className="result-card">
      <div className="result-title"><AlertIcon /> Mesh check</div>
      <div className="result-warning-text">Review these before planning.</div>
      <div className="result-rows">
        <div className={`result-row${health.openEdges > 0 ? " result-row-warning" : ""}`}><span>Triangles</span><strong className="numeric">{health.triangles}</strong></div>
        <div className={`result-row${health.bodies > 1 ? " result-row-warning" : ""}`}><span>Bodies</span><strong className="numeric">{health.bodies}</strong></div>
        <div className={`result-row${health.openEdges > 0 ? " result-row-warning" : ""}`}><span>Open edges</span><strong className="numeric">{health.openEdges}</strong></div>
        <div className="result-row"><span>Size</span><strong className="numeric">{size.x.toFixed(2)} × {size.y.toFixed(2)} × {size.z.toFixed(2)} model units</strong></div>
      </div>
      {notes.length > 0 && <div className="result-notes">{notes.map((n) => <div key={n}>{n}</div>)}</div>}
      <div className="result-explainer">Open edges can be intentional, like a nozzle or a manhole. Repair only if this part should be closed.</div>
      {!REPAIR_AVAILABLE && <div className="result-muted">Automatic repair isn't available yet.</div>}
      <div className="result-actions">
        {REPAIR_AVAILABLE && <button type="button" className="btn-secondary" onClick={async () => { const { repairFile } = await import("../../lib/meshClient"); await repairFile(); }}>Repair</button>}
        <button type="button" className="btn-primary" onClick={() => setStep("seams")}>Continue as is</button>
        <button type="button" className="btn-ghost" onClick={loadAnother}>Load another</button>
      </div>
    </div>
  );
}
