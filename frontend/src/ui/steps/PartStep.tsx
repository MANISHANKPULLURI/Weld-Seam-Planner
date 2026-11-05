import { StepNav } from "../components/StepNav";
import { useStore } from "../../state/store";
import { DropZone } from "../components/DropZone";
import { CheckProgress } from "../components/CheckProgress";
import { HealthCard } from "../components/HealthCard";
import { OrientCard } from "../components/OrientCard";

/**
 * what happens in the part step and how to get through it
 */
function PartGuide() {
  return (
    <details className="disclosure result-card" aria-label="How this step works">
      <summary>How this step works</summary>
      <ol className="seam-guide-steps">
        <li><span className="seam-guide-num" aria-hidden="true">1</span><span><strong>Drop an STL.</strong> It is parsed and checked automatically: open edges, flipped faces, separate bodies.</span></li>
        <li><span className="seam-guide-num" aria-hidden="true">2</span><span><strong>Repair if needed.</strong> Optional — fills holes and fixes face orientation. Skip it for intentional openings.</span></li>
        <li><span className="seam-guide-num" aria-hidden="true">3</span><span><strong>Confirm units and up-axis.</strong> Nothing downstream unlocks until you do — the export depends on it.</span></li>
      </ol>
    </details>
  );
}

/**
 * a weld job file waiting for its part to be loaded, so it can be restored
 */
function PendingImport() {
  const pending = useStore((s) => s.pendingImport);
  const mesh = useStore((s) => s.mesh);
  const part = useStore((s) => s.part);
  const { setPendingImport } = useStore.getState();
  if (!pending) return null;
  const matches = !!mesh && !!part?.sha256 && pending.part.sha256 === part.sha256;
  return (
    <section className="result-card" aria-label="Waiting weld job">
      <header className="result-header">
        <span className="result-title">Weld job waiting</span>
        <button type="button" className="btn-link" onClick={() => setPendingImport(null)}>Discard</button>
      </header>
      <p className="result-explainer">
        “{pending.job.name}” ({pending.seams.length} seam{pending.seams.length === 1 ? "" : "s"}) was imported and is waiting
        {!mesh ? <> for its part (<strong>{pending.part.filename}</strong>). Load that STL below.</> : matches ? " — this is its part." : <> for <strong>{pending.part.filename}</strong>. The loaded part does not match.</>}
      </p>
      {mesh && (
        <div className="result-actions result-actions-split">
          <button type="button" className="btn-primary" disabled={!matches} title={matches ? "Restore seams, procedures and order onto this part" : `Load ${pending.part.filename} first`} onClick={() => { const s = useStore.getState(); if (s.pendingImport) { const msg = s.importJob(s.pendingImport); s.setPendingImport(null); if (!msg.startsWith("This job")) s.setStep("review"); } }}>Restore now</button>
        </div>
      )}
    </section>
  );
}

/**
 * render the part step for the current phase
 */
export function PartStep() {
  const phase = useStore((s) => s.phase);
  if (phase === "analysing" || phase === "repairing") return <CheckProgress />;
  if (phase === "checked" || phase === "error") return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <PartGuide />
      <PendingImport />
      <HealthCard />
      <OrientCard />
      {phase === "checked" && <StepNav note="Next finds the weld seams. Going on accepts the units and up axis above." />}
    </div>
  );
  return (<div style={{ display: "flex", flexDirection: "column", gap: 16 }}><PartGuide /><PendingImport /><DropZone /></div>);
}
