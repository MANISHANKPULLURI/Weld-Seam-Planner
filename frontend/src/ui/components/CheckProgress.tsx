import { STAGE_ORDER, useStore } from "../../state/store";
import type { StageId } from "../../state/store";
import { CheckIcon, XIcon } from "../icons";
import { formatBytes } from "../../domain/mesh/describe";

const STAGE_LABEL: Record<StageId, string> = {
  read: "Reading the file",
  weld: "Merging duplicate vertices",
  topology: "Checking edges and bodies",
  orient: "Orienting faces",
};

/**
 * show part-analysis progress or repair status
 */
export function CheckProgress() {
  const phase = useStore((s) => s.phase);
  const stages = useStore((s) => s.stages);
  const progress = useStore((s) => s.progress);
  const part = useStore((s) => s.part);
  const repairing = phase === "repairing";

  if (repairing) {
    return (
      <section className="result-card" role="status" aria-live="polite">
        <header className="result-header">
          <span className="result-title">Repairing</span>
          <span className="spinner" aria-hidden="true" />
        </header>
        <p className="result-explainer">Filling holes and turning faces outward. This runs in your browser.</p>
      </section>
    );
  }

  return (
    <section className="result-card" role="status" aria-live="polite">
      <header className="result-header">
        <span className="result-title">Checking your part</span>
        <span className="numeric progress-percent">{progress}%</span>
      </header>
      {part && (
        <p className="progress-file">
          <span className="progress-file-name" title={part.fileName}>{part.fileName}</span>
          <span className="numeric">{formatBytes(part.sizeBytes)}</span>
        </p>
      )}
      <div className="progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
        <div className="progress-fill" style={{ width: `${progress}%` }} />
      </div>
      <ul className="check-stages">
        {STAGE_ORDER.map((id) => {
          const state = stages[id];
          return (
            <li key={id} className={`check-stage check-stage-${state}`}>
              <span className={`check-icon check-icon-${state}`} aria-hidden="true">
                {state === "done" ? <CheckIcon size={11} /> : state === "error" ? <XIcon size={11} /> : null}
              </span>
              {STAGE_LABEL[id]}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
