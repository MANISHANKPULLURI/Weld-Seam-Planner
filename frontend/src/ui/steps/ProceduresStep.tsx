import { useState } from "react";
import { useStore } from "../../state/store";
import { ProcedureLibrary } from "../components/ProcedureLibrary";
import { WeldSeamList } from "../components/WeldSeamList";
import { WeldInspector } from "../components/WeldInspector";
import { StepNav } from "../components/StepNav";

/**
 * render the procedure assignment step
 */
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

/**
 * explain the procedures step with live counts
 */
function ProcGuide() {
  const seams = useStore((s) => s.seams.filter((x) => x.status === "accepted").length);
  const assigned = useStore((s) => s.seams.filter((x) => x.status === "accepted" && x.weld).length);
  return (
    <details className="disclosure result-card" aria-label="How this step works">
      <summary>How this step works</summary>
      <ol className="seam-guide-steps">
        <li className={assigned === seams && seams > 0 ? "is-done" : ""}><span className="seam-guide-num" aria-hidden="true">{assigned === seams && seams > 0 ? "✓" : 1}</span><span><strong>Choose a procedure.</strong> Pick one in the list. Edit, copy, or start a blank one with New custom to match your welding procedure (WPS).</span></li>
        <li className={assigned === seams && seams > 0 ? "is-done" : ""}><span className="seam-guide-num" aria-hidden="true">{assigned === seams && seams > 0 ? "✓" : 2}</span><span><strong>Apply it to seams.</strong> Tick seams and press Apply, or use Apply to the ones without one.</span></li>
        <li><span className="seam-guide-num" aria-hidden="true">3</span><span><strong>Adjust one seam (optional).</strong> Pick a seam to set its weld size, stitches, torch angles or its own current and speed.</span></li>
      </ol>
      <p className="result-explainer">{assigned} of {seams} seams have a procedure.{seams > 0 && assigned === seams ? " Next: Sequence, to set the welding order." : ""}</p>
    </details>
  );
}
