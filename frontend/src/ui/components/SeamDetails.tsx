import { seamLengthMm, useStore } from "../../state/store";

const SOURCE_LABEL = { inside_corner: "Inside corner", outside_corner: "Outside corner", contact: "Plates touch", intersection: "Parts intersect", edge_chain: "Picked edge", drawn: "Drawn by hand" } as const;

export function SeamDetails() {
  const seam = useStore((s) => s.seams.find((x) => x.id === s.selectedSeamId));
  const units = useStore((s) => s.frame.units);
  const pending = useStore((s) => s.pendingAction);
  const { acceptSeams, rejectSeams, renameSeam, reverseSeam, deleteSeam, setPendingAction, selectSeam } = useStore.getState();

  if (!seam) return null;

  const candidate = seam.status === "candidate";

  return (
    <section className="result-card seam-details" aria-label="Selected seam">
      <header className="result-header">
        {candidate
          ? <span className="result-title">Candidate</span>
          : <input className="field-control seam-name-input" value={seam.name} aria-label="Seam name" onChange={(e) => renameSeam(seam.id, e.target.value)} />}
        <button type="button" className="btn-link" onClick={() => selectSeam(null)}>Close</button>
      </header>

      <dl className="health-summary">
        <div><dt>Length</dt><dd className="numeric">{seamLengthMm(seam, units).toFixed(1)} mm{seam.closed ? ", closed loop" : ""}</dd></div>
        <div><dt>Found by</dt><dd>{SOURCE_LABEL[seam.source]}</dd></div>
        {seam.angleDeg > 0 && <div><dt>Angle between faces</dt><dd className="numeric">{seam.angleDeg}°</dd></div>}
        {candidate && <div><dt>Confidence</dt><dd>{seam.confidence >= 0.85 ? "High" : seam.confidence >= 0.7 ? "Medium" : "Low"}</dd></div>}
      </dl>

      {candidate ? (
        <div className="result-actions result-actions-split">
          <button type="button" className="btn-secondary" onClick={() => rejectSeams([seam.id])}>Reject</button>
          <button type="button" className="btn-primary" onClick={() => acceptSeams([seam.id])}>Accept</button>
        </div>
      ) : (
        <div className="seam-edit-actions">
          <button type="button" className="btn-secondary" onClick={() => reverseSeam(seam.id)} title="Swap the start and end">Reverse</button>
          <button type="button" className="btn-secondary" aria-pressed={pending === "split"} onClick={() => setPendingAction(pending === "split" ? null : "split")} title="Click on the seam where it should be cut">Split</button>
          <button type="button" className="btn-secondary" aria-pressed={pending === "merge"} onClick={() => setPendingAction(pending === "merge" ? null : "merge")} disabled={seam.closed} title="Click another seam that shares an end">Merge</button>
          <button type="button" className="btn-ghost btn-danger" onClick={() => deleteSeam(seam.id)}>Delete</button>
        </div>
      )}
    </section>
  );
}
