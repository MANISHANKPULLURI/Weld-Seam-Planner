import { useStore } from "../../state/store";

export function SeamGuide() {
  const detected = useStore((s) => s.detection.status === "done");
  const candidates = useStore((s) => s.seams.filter((x) => x.status === "candidate").length);
  const accepted = useStore((s) => s.seams.filter((x) => x.status === "accepted").length);

  const steps = [
    { done: detected, title: "Find seams", text: "Press Detect seams. Suggestions appear as dashed rings on the part." },
    { done: detected && accepted > 0, title: "Keep the real welds", text: "In All model seams, ✓ keeps a suggestion, ✕ drops it. Kept ones turn solid, each in its own colour." },
    { done: accepted > 0, title: "Fix or add (optional)", text: "Pick a seam and the card floats beside the panel: Reverse, Split, Merge or Delete there. Use Pick edge or Draw for seams that were missed." },
  ];

  return (
    <details className="disclosure result-card" aria-label="How this step works">
      <summary>How this step works</summary>
      <ol className="seam-guide-steps">
        {steps.map((s, i) => (
          <li key={s.title} className={s.done ? "is-done" : ""}>
            <span className="seam-guide-num" aria-hidden="true">{s.done ? "✓" : i + 1}</span>
            <span><strong>{s.title}.</strong> {s.text}</span>
          </li>
        ))}
      </ol>
      <p className="result-explainer">{accepted > 0 ? `${accepted} kept${candidates > 0 ? ` · ${candidates} to review` : ""}.` : candidates > 0 ? `${candidates} to review in All model seams.` : "Detect seams to get suggestions, or add seams with Pick edge or Draw."} When you're done, go to Procedures to set weld parameters.</p>
    </details>
  );
}
