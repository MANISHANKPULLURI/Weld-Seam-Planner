import { useEffect, useMemo, useState } from "react";
import { candidateVisible, inWorkArea, seamLengthMm, useStore } from "../../state/store";
import { JOINT_HELP } from "./SeamList";

// Walks through the suggestions one at a time: the camera frames each, the user keeps or drops it.
// The list is frozen when the review starts, so keeping or dropping doesn't shift what comes next.
export function CandidateReview({ onClose }: { onClose: () => void }) {
  const units = useStore((s) => s.frame.units);
  const seams = useStore((s) => s.seams);
  const { acceptSeams, rejectSeams, selectSeam, frameSeams, setStep, restoreCandidate } = useStore.getState();
  const original = useMemo(() => {
    const s = useStore.getState();
    return s.seams
      .filter((x) => x.status === "candidate" && candidateVisible(x, s.candidateFilter, s.frame.units) && inWorkArea(x, s.workArea))
      .sort((a, b) => b.confidence - a.confidence || b.length - a.length);
  }, []);
  const queue = useMemo(() => original.map((x) => x.id), [original]);
  const [index, setIndex] = useState(0);
  const [decisions, setDecisions] = useState<Record<string, "kept" | "dropped">>({});

  const id = queue[index];
  // A dropped suggestion is gone from the store; show the copy taken at the start.
  const seam = seams.find((x) => x.id === id) ?? original.find((x) => x.id === id);
  const done = index >= queue.length;
  const kept = Object.values(decisions).filter((d) => d === "kept").length;
  const dropped = Object.values(decisions).filter((d) => d === "dropped").length;

  useEffect(() => {
    if (!id) return;
    const cached = original.find((x) => x.id === id);
    if (cached && !useStore.getState().seams.some((x) => x.id === id)) restoreCandidate(cached);
    selectSeam(id);
    frameSeams([id]);
  }, [id, selectSeam, frameSeams, original, restoreCandidate]);

  const decide = (choice: "kept" | "dropped") => {
    if (!id) return;
    const current = useStore.getState().seams.find((x) => x.id === id);
    if (choice === "kept") { if (current?.status === "candidate") acceptSeams([id]); }
    else if (current?.status === "accepted") { useStore.getState().deleteSeam(id); } else rejectSeams([id]);
    setDecisions((d) => ({ ...d, [id]: choice }));
    setIndex((i) => i + 1);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const k = e.key.toLowerCase();
      if (k === "k" || k === "enter") { e.preventDefault(); decide("kept"); }
      else if (k === "d" || k === "x") { e.preventDefault(); decide("dropped"); }
      else if (e.key === "ArrowRight") setIndex((i) => Math.min(queue.length, i + 1));
      else if (e.key === "ArrowLeft") setIndex((i) => Math.max(0, i - 1));
      else if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (queue.length === 0) {
    return (
      <section className="result-card review-card">
        <p className="result-explainer">Nothing to review: no suggestions are shown. Detect seams, or loosen the filters.</p>
        <button type="button" className="btn-secondary" onClick={onClose}>Close</button>
      </section>
    );
  }

  if (done || !seam) {
    return (
      <section className="result-card review-card" aria-label="Review finished">
        <header className="result-header"><span className="result-title">Review done</span></header>
        <p className="review-summary"><strong>{kept}</strong> kept · <strong>{dropped}</strong> dropped · {queue.length - kept - dropped} skipped</p>
        <div className="result-actions result-actions-split">
          <button type="button" className="btn-secondary" onClick={() => setIndex(0)}>Go through again</button>
          <button type="button" className="btn-primary" onClick={() => { onClose(); selectSeam(null); setStep("procedures"); }}>Next: Procedures →</button>
        </div>
        <button type="button" className="btn-link" onClick={() => { onClose(); selectSeam(null); }}>Back to the list</button>
      </section>
    );
  }

  const status = decisions[seam.id];

  return (
    <section className="result-card review-card" aria-label="Review suggestions one by one">
      <header className="result-header">
        <span className="result-title">Suggestion {index + 1} of {queue.length}</span>
        <button type="button" className="btn-link" onClick={onClose}>Exit</button>
      </header>
      <div className="review-progress" aria-hidden="true"><span style={{ width: `${(index / queue.length) * 100}%` }} /></div>
      <p className="review-what"><strong>{seam.reason}</strong> · {seamLengthMm(seam, units).toFixed(1)} mm · {seam.confidence >= 0.85 ? "high" : seam.confidence >= 0.7 ? "medium" : "low"} confidence</p>
      <p className="result-explainer">{JOINT_HELP[seam.jointType]} The camera shows it in orange. Is this a real weld?</p>
      {status && <p className="field-hint">You {status} this one. Choose again to change it.</p>}
      <div className="review-buttons">
        <button type="button" className="btn-secondary review-drop" onClick={() => decide("dropped")}>✕ Drop <kbd>D</kbd></button>
        <button type="button" className="btn-primary review-keep" onClick={() => decide("kept")}>✓ Keep <kbd>K</kbd></button>
      </div>
      <div className="review-nav">
        <button type="button" className="btn-link" disabled={index === 0} onClick={() => setIndex((i) => i - 1)}>← Previous</button>
        <span className="field-hint">{kept} kept · {dropped} dropped</span>
        <button type="button" className="btn-link" onClick={() => setIndex((i) => i + 1)}>Skip →</button>
      </div>
    </section>
  );
}
