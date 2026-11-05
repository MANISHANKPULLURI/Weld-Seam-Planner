import { useState } from "react";
import { JOINT_HELP } from "../labels";
import { SplitPanel } from "./SplitPanel";
import { focusForSeam } from "../../lib/focus";
import { mergeTargets, seamLengthMm, useStore } from "../../state/store";

const ACTION_HELP = {
  reverse: "Reverse: weld this seam the other way. The start dot and end arrow swap.",
  split: "Split: cuts this seam into two separate seams (two rows in the list), each with its own settings later. Use it to skip a hole or weld halves differently.",
  merge: "Merge: join with a seam that touches one of its ends, so it is welded in one go.",
  delete: "Delete: remove this seam. Detection will not suggest it again.",
} as const;

const SOURCE_LABEL = { inside_corner: "Inside corner", outside_corner: "Outside corner", contact: "Plates touch", intersection: "Parts intersect", edge_chain: "Picked edge", drawn: "Drawn by hand" } as const;

/**
 * act on the selected seam: keep, split, merge and more
 */
export function SeamDetails() {
  const seam = useStore((s) => s.seams.find((x) => x.id === s.selectedSeamId));
  const units = useStore((s) => s.frame.units);
  const pending = useStore((s) => s.pendingAction);
  const seams = useStore((s) => s.seams);
  const [help, setHelp] = useState<keyof typeof ACTION_HELP | null>(null);
  const { acceptSeams, rejectSeams, renameSeam, reverseSeam, deleteSeam, setPendingAction, selectSeam } = useStore.getState();

  if (!seam) return null;

  const candidate = seam.status === "candidate";
  const targets = mergeTargets(seams, seam.id);

  return (
    <section aria-label="Selected seam" className="result-card seam-details">
      <header className="result-header">
        {candidate
          ? <span className="result-title">Candidate</span>
          : <input className="field-control seam-name-input" value={seam.name} aria-label="Seam name" onChange={(e) => renameSeam(seam.id, e.target.value)} />}
        <span className="seam-head-actions">
          <button type="button" className="btn-link" onClick={() => { const mesh = useStore.getState().mesh; if (mesh) useStore.getState().setFocus(focusForSeam(mesh, seam)); }} title="Zoom to this seam and fade parts it does not touch">Focus</button>
          <button type="button" className="btn-link" onClick={() => selectSeam(null)}>Close</button>
        </span>
      </header>

      <dl className="health-summary">
        <div><dt>Length</dt><dd className="numeric">{seamLengthMm(seam, units).toFixed(1)} mm{seam.closed ? ", closed loop" : ""}</dd></div>
        <div><dt>Found by</dt><dd>{SOURCE_LABEL[seam.source]}</dd></div>
        {seam.angleDeg > 0 && <div><dt>Angle between faces</dt><dd className="numeric">{seam.angleDeg}°</dd></div>}
        {candidate && <div><dt>Confidence</dt><dd>{seam.confidence >= 0.85 ? "High" : seam.confidence >= 0.7 ? "Medium" : "Low"}</dd></div>}
      </dl>
      <p className="result-explainer">
        {JOINT_HELP[seam.jointType]}
        {seam.angleDeg > 0 && ` The surfaces meet at ${seam.angleDeg}°; fillet welds suit about 45° to 120°.`}
        {candidate && " Confidence is high for clean right-angle corners and lower for unusual angles or touching parts."}
      </p>

      {candidate ? (
        <div className="result-actions result-actions-split">
          <button type="button" className="btn-secondary" onClick={() => rejectSeams([seam.id])}>Reject</button>
          <button type="button" className="btn-primary" onClick={() => acceptSeams([seam.id])}>Accept</button>
        </div>
      ) : (
        <div className="seam-edit-actions">
          <button type="button" className="btn-secondary" onMouseEnter={() => setHelp("reverse")} onMouseLeave={() => setHelp(null)} onFocus={() => setHelp("reverse")} onBlur={() => setHelp(null)} onClick={() => reverseSeam(seam.id)} disabled={seam.closed} title="Weld the other way: swaps the start dot and the end arrow">Reverse</button>
          <button type="button" className="btn-secondary" aria-pressed={pending === "split"} onMouseEnter={() => setHelp("split")} onMouseLeave={() => setHelp(null)} onFocus={() => setHelp("split")} onBlur={() => setHelp(null)} onClick={() => setPendingAction(pending === "split" ? null : "split")} title="Cut this seam in two where you click on it">{pending === "split" ? "Cancel split" : "Split"}</button>
          <button type="button" className="btn-secondary" aria-pressed={pending === "merge"} onMouseEnter={() => setHelp("merge")} onMouseLeave={() => setHelp(null)} onFocus={() => setHelp("merge")} onBlur={() => setHelp(null)} onClick={() => setPendingAction(pending === "merge" ? null : "merge")} disabled={targets.length === 0} title="Join with a seam that touches one of its ends">{pending === "merge" ? "Cancel merge" : "Merge"}</button>
          <button type="button" className="btn-ghost btn-danger" onMouseEnter={() => setHelp("delete")} onMouseLeave={() => setHelp(null)} onFocus={() => setHelp("delete")} onBlur={() => setHelp(null)} onClick={() => deleteSeam(seam.id)} title="Remove this seam. Detection will not suggest it again.">Delete</button>
        </div>
      )}
      {pending === "split" && <SplitPanel seam={seam} />}
      {pending === "merge" && (
        <div className="seam-mode-box" role="status">
          <strong>Merge is on.</strong>{" "}
          {`Click ${targets.map((t) => t.name).join(" or ")} on the part to join it.`}
          {" "}Esc or the button again cancels.
        </div>
      )}
      {!candidate && !pending && help && <p className="result-explainer seam-action-help">{ACTION_HELP[help]}</p>}
      {!candidate && !pending && !help && (
        <p className="result-explainer">
          {seam.closed ? "Closed loop: welded all the way round, in the direction of the small arrows." : "Welding starts at the big dot and runs along the small arrows to the end arrow."}
          {!seam.closed && (targets.length ? ` Can merge with ${targets.map((t) => t.name).join(", ")}.` : " No seam touches its ends, so Merge is off.")}
        </p>
      )}
    </section>
  );
}
