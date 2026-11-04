import { useStore } from "../../state/store";
import type { Step } from "../../state/store";

const ORDER: { id: Step; label: string }[] = [
  { id: "part", label: "Part" }, { id: "seams", label: "Seams" }, { id: "procedures", label: "Procedures" },
  { id: "sequence", label: "Sequence" }, { id: "review", label: "Review" },
];

// Back / Next at the bottom of each step. note explains what the next step needs, if anything.
export function StepNav({ note }: { note?: string }) {
  const step = useStore((s) => s.step);
  const setStep = useStore((s) => s.setStep);
  const i = ORDER.findIndex((x) => x.id === step);
  const prev = ORDER[i - 1], next = ORDER[i + 1];
  return (
    <nav className="step-nav" aria-label="Step navigation">
      {note && <p className="field-hint step-nav-note">{note}</p>}
      <div className="step-nav-buttons">
        {prev ? <button type="button" className="btn-secondary" onClick={() => setStep(prev.id)}>← {prev.label}</button> : <span />}
        {next && <button type="button" className="btn-primary" onClick={() => setStep(next.id)}>Next: {next.label} →</button>}
      </div>
    </nav>
  );
}
