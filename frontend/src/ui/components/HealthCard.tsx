import { useStore } from "../../state/store";
import { CheckIcon, AlertIcon } from "../icons";
import { formatCount, formatSize, healthChecks } from "../../domain/mesh/describe";
import { REPAIR_AVAILABLE } from "../../domain/mesh/repair";
import { createSampleStl } from "../../domain/mesh/sample";
import { analyseFile, repairFile } from "../../lib/meshClient";
import type { Health } from "../../domain/mesh/health";

function downloadRepaired() {
  const { repairedBinary, mesh } = useStore.getState();
  let data = repairedBinary;
  if (!data && mesh) {
    const count = mesh.indices.length / 3;
    data = new ArrayBuffer(84 + count * 50);
    const view = new DataView(data);
    view.setUint32(80, count, true);
    let off = 84;
    for (let i = 0; i < count; i++) {
      off += 12;
      for (let k = 0; k < 3; k++) {
        const idx = mesh.indices[i * 3 + k]! * 3;
        view.setFloat32(off, mesh.positions[idx]!, true); view.setFloat32(off + 4, mesh.positions[idx + 1]!, true); view.setFloat32(off + 8, mesh.positions[idx + 2]!, true); off += 12;
      }
      off += 2;
    }
  }
  if (!data) return;
  const url = URL.createObjectURL(new Blob([data], { type: "model/stl" }));
  const el = document.createElement("a");
  el.href = url;
  el.download = "repaired.stl";
  el.click();
  URL.revokeObjectURL(url);
}

function Summary({ health }: { health: Health }) {
  return (
    <dl className="health-summary">
      <div><dt>Triangles</dt><dd className="numeric">{formatCount(health.triangles)}</dd></div>
      <div><dt>Size <span className="health-unit">model units</span></dt><dd className="numeric">{formatSize(health.bounds.size)}</dd></div>
    </dl>
  );
}

function Checks({ health }: { health: Health }) {
  return (
    <ul className="health-checks" aria-label="Mesh checks">
      {healthChecks(health).map((c) => (
        <li key={c.id} className={`health-check${c.ok ? " health-check-ok" : " health-check-warn"}`}>
          <span className="health-check-icon" aria-hidden="true">{c.ok ? <CheckIcon size={12} /> : <AlertIcon size={12} />}</span>
          <span className="health-check-label">{c.label}</span>
          <span className="health-check-value numeric">{formatCount(c.value)}</span>
          {!c.ok && <span className="health-check-hint">{c.hint}</span>}
        </li>
      ))}
    </ul>
  );
}

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
      <section className="result-card" role="alert">
        <header className="result-header">
          <span className="result-title"><AlertIcon /> Mesh check</span>
          <span className="status-badge status-badge-danger">Failed</span>
        </header>
        <p className="result-danger-text">{error}</p>
        <div className="result-actions">
          <button type="button" className="btn-primary" onClick={loadAnother}>Try another file</button>
          <button type="button" className="btn-secondary" onClick={() => analyseFile(createSampleStl(), "sample.stl")}>Load sample part</button>
        </div>
      </section>
    );
  }

  if (!health || !verdict || typeof health.triangles !== "number") return null;

  if (repaired && originalHealth) {
    const before = healthChecks(originalHealth);
    const after = healthChecks(health);
    return (
      <section className="result-card">
        <header className="result-header">
          <span className="result-title"><CheckIcon /> Mesh check</span>
          <span className="status-badge status-badge-ok">Repaired</span>
        </header>
        <table className="repaired-table">
          <thead><tr><th scope="col">Check</th><th scope="col">Before</th><th scope="col">After</th></tr></thead>
          <tbody>
            <tr>
              <th scope="row">Triangles</th>
              <td className="numeric">{formatCount(originalHealth.triangles)}</td>
              <td className={`numeric${originalHealth.triangles !== health.triangles ? " changed" : ""}`}>{formatCount(health.triangles)}</td>
            </tr>
            {before.map((b, i) => (
              <tr key={b.id}>
                <th scope="row">{b.label}</th>
                <td className="numeric">{formatCount(b.value)}</td>
                <td className={`numeric${b.value !== after[i]!.value ? " changed" : ""}`}>{formatCount(after[i]!.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="result-explainer">You are working on a repaired copy. The original file is unchanged.</p>
        <div className="result-actions result-actions-split">
          <button type="button" className="btn-secondary" onClick={downloadRepaired}>Download STL</button>
          <button type="button" className="btn-primary" onClick={() => setStep("seams")}>Continue to seams</button>
        </div>
        <button type="button" className="btn-link" onClick={undoRepair}>Undo repair</button>
      </section>
    );
  }

  const pass = verdict === "pass";

  return (
    <section className="result-card">
      <header className="result-header">
        <span className="result-title">{pass ? <CheckIcon /> : <AlertIcon />} Mesh check</span>
        <span className={`status-badge ${pass ? "status-badge-ok" : "status-badge-warn"}`}>{pass ? "Ready" : "Needs review"}</span>
      </header>
      <Summary health={health} />
      <Checks health={health} />
      {!pass && (
        <p className="result-explainer">
          Repair turns flipped faces outward and fills holes. Skip it if the openings are intentional, such as nozzles or manholes.
        </p>
      )}
      <div className="result-actions result-actions-split">
        {!pass && REPAIR_AVAILABLE && <button type="button" className="btn-secondary" onClick={() => void repairFile()}>Repair</button>}
        <button type="button" className="btn-primary" onClick={() => setStep("seams")}>{pass ? "Continue to seams" : "Continue as is"}</button>
      </div>
      <button type="button" className="btn-link" onClick={loadAnother}>Load another file</button>
    </section>
  );
}
