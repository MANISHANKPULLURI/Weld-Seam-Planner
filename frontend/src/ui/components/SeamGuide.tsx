import { useState } from "react";
import { useStore } from "../../state/store";

const KEY = "weld.seamGuideHidden";

// First-visit guide for the seam step. Each line ticks off as the user does it.
export function SeamGuide() {
  const [hidden, setHidden] = useState(() => localStorage.getItem(KEY) === "1");
  const detected = useStore((s) => s.detection.status === "done");
  const candidates = useStore((s) => s.seams.filter((x) => x.status === "candidate").length);
  const accepted = useStore((s) => s.seams.filter((x) => x.status === "accepted").length);

  if (hidden) {
    return <button type="button" className="btn-link seam-guide-show" onClick={() => { localStorage.removeItem(KEY); setHidden(false); }}>How does this step work?</button>;
  }

  const steps = [
    { done: detected, title: "Find seams", text: "Press Detect seams. Suggestions appear as dashed lines on the part." },
    { done: detected && accepted > 0, title: "Keep the real welds", text: "In the list, ✓ keeps a suggestion, ✕ drops it. Kept ones turn solid, each in its own colour." },
    { done: accepted > 0, title: "Fix or add (optional)", text: "Click a seam to rename, reverse, split, merge or delete it. Use Pick edge or Draw for seams that were missed." },
  ];

  // After the first detect the guide collapses to one line so Detect → Tools → List stay visible.
  if (detected && !hidden) {
    const doneCount = (detected ? 1 : 0) + (accepted > 0 ? 2 : 0);
    return (
      <section className="result-card seam-guide seam-guide-compact" aria-label="How this step works">
        <span className="result-explainer">●●{doneCount >= 3 ? "●" : "○"} {accepted > 0 ? `${accepted} kept · ${candidates} to review.` : `${candidates} to review below.`} Pick edge or Draw adds missed ones.</span>
        <button type="button" className="btn-link" onClick={() => { localStorage.setItem(KEY, "1"); setHidden(true); }}>Hide</button>
      </section>
    );
  }

  return (
    <section className="result-card seam-guide" aria-label="How this step works">
      <header className="result-header">
        <span className="result-title">Mark the welds</span>
        <button type="button" className="btn-link" onClick={() => { localStorage.setItem(KEY, "1"); setHidden(true); }}>Hide</button>
      </header>
      <ol className="seam-guide-steps">
        {steps.map((s, i) => (
          <li key={s.title} className={s.done ? "is-done" : ""}>
            <span className="seam-guide-num" aria-hidden="true">{s.done ? "✓" : i + 1}</span>
            <span><strong>{s.title}.</strong> {s.text}</span>
          </li>
        ))}
      </ol>
      {accepted > 0 && <p className="result-explainer">{accepted} seam{accepted === 1 ? "" : "s"} kept. When you're done, go to Procedures to set weld parameters.</p>}
    </section>
  );
}
