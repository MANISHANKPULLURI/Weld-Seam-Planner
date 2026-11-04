import { useEffect, useRef, useState } from "react";
import { JOINT_HELP } from "./SeamList";
import { mergeTargets, seamLengthMm, useStore } from "../../state/store";

const ACTION_HELP = {
  reverse: "Reverse: weld this seam the other way. The start dot and end arrow swap.",
  split: "Split: really cuts this seam into two separate seams (two rows in the list, a dot at the joint), each with its own settings later. Use it to skip a hole or weld halves differently.",
  merge: "Merge: join with a seam that touches one of its ends, so it is welded in one go.",
  delete: "Delete: remove this seam. Detection will not suggest it again.",
} as const;

const SOURCE_LABEL = { inside_corner: "Inside corner", outside_corner: "Outside corner", contact: "Plates touch", intersection: "Parts intersect", edge_chain: "Picked edge", drawn: "Drawn by hand" } as const;

export function SeamDetails() {
  const seam = useStore((s) => s.seams.find((x) => x.id === s.selectedSeamId));
  const units = useStore((s) => s.frame.units);
  const pending = useStore((s) => s.pendingAction);
  const seams = useStore((s) => s.seams);
  const [help, setHelp] = useState<keyof typeof ACTION_HELP | null>(null);
  const { acceptSeams, rejectSeams, renameSeam, reverseSeam, deleteSeam, setPendingAction, selectSeam } = useStore.getState();

  const ref = useRef<HTMLElement>(null);
  // Selecting from the list or the part brings this card into view, with its edit buttons.
  useEffect(() => { ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }); }, [seam?.id]);

  if (!seam) return null;

  const candidate = seam.status === "candidate";
  const targets = mergeTargets(seams, seam.id);

  return (
    <section ref={ref} className="result-card seam-details" aria-label="Selected seam">
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
      {pending && (
        <div className="seam-mode-box" role="status">
          <strong>{pending === "split" ? "Split is on." : "Merge is on."}</strong>{" "}
          {pending === "split" ? "Move along the orange seam on the part, a dot shows the cut. Click on the line to cut it." : `Click ${targets.map((t) => t.name).join(" or ")} on the part to join it.`}
          {" "}Esc or the button again cancels.
        </div>
      )}
      {!candidate && !pending && help && <p className="result-explainer seam-action-help">{ACTION_HELP[help]}</p>}
      {!candidate && !pending && !help && (
        <p className="result-explainer">
          {seam.closed ? "Closed loop: welded all the way round." : "The dot marks where welding starts, the arrow where it ends."}
          {!seam.closed && (targets.length ? ` Can merge with ${targets.map((t) => t.name).join(", ")}.` : " No seam touches its ends, so Merge is off.")}
        </p>
      )}
    </section>
  );
}
