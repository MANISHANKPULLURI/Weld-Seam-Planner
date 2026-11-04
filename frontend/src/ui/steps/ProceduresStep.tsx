import { useState } from "react";
import { useStore } from "../../state/store";
import { ProcedureLibrary } from "../components/ProcedureLibrary";
import { WeldSeamList } from "../components/WeldSeamList";
import { WeldInspector } from "../components/WeldInspector";
import { StepNav } from "../components/StepNav";

export function ProceduresStep() {
  const procedures = useStore((s) => s.procedures);
  const [activeId, setActiveId] = useState(() => procedures[0]?.id ?? "");
  const missing = useStore((s) => s.seams.filter((x) => x.status === "accepted" && !x.weld).length);
  const active = procedures.some((p) => p.id === activeId) ? activeId : procedures[0]?.id ?? "";

  return (
    <div className="seams-stack">
      <WeldInspector />
      <ProcGuide />
      <ProcedureLibrary activeId={active} onActive={setActiveId} />
      <WeldSeamList activeId={active} />
      <StepNav note={missing ? `${missing} seam${missing === 1 ? "" : "s"} still need a procedure; the export will flag ${missing === 1 ? "it" : "them"}.` : undefined} />
    </div>
  );
}

function ProcGuide() {
  const seams = useStore((s) => s.seams.filter((x) => x.status === "accepted").length);
  const assigned = useStore((s) => s.seams.filter((x) => x.status === "accepted" && x.weld).length);
  const steps = [
    { done: false, title: "Choose a procedure", text: "Pick one in the list. Edit or copy it to match your welding procedure (WPS)." },
    { done: seams > 0 && assigned === seams, title: "Apply it to seams", text: "Tick seams and press Apply, or use Apply to the ones without one." },
    { done: false, title: "Adjust one seam (optional)", text: "Click a seam to set its weld size, stitches, torch angles or its own current and speed." },
  ];
  return (
    <section className="result-card seam-guide" aria-label="How this step works">
      <header className="result-header"><span className="result-title">Set weld parameters</span></header>
      <ol className="seam-guide-steps">
        {steps.map((s, i) => (
          <li key={s.title} className={s.done ? "is-done" : ""}>
            <span className="seam-guide-num" aria-hidden="true">{s.done ? "✓" : i + 1}</span>
            <span><strong>{s.title}.</strong> {s.text}</span>
          </li>
        ))}
      </ol>
      <p className="result-explainer">{assigned} of {seams} seams have a procedure.{seams > 0 && assigned === seams ? " Next: Sequence, to set the welding order." : ""}</p>
    </section>
  );
}
