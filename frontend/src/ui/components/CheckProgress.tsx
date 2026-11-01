import { useStore } from "../../state/store";
import { CheckIcon, AlertIcon, XIcon } from "../icons";

const STAGES: { id: "read" | "weld" | "topology" | "measure"; label: string }[] = [
  { id: "read", label: "Reading triangles" },
  { id: "weld", label: "Merging matching vertices" },
  { id: "topology", label: "Checking edges, faces and bodies" },
  { id: "measure", label: "Measuring the part" },
];

const REPAIR_STAGES = [
  { id: "close", label: "Closing small holes" },
  { id: "align", label: "Aligning face directions" },
  { id: "check", label: "Checking the result" },
];

export function CheckProgress() {
  const phase = useStore((s) => s.phase);
  const stages = useStore((s) => s.stages);
  const progress = useStore((s) => s.progress);
  const repairing = phase === "repairing";
  const list = repairing ? REPAIR_STAGES.map((r) => ({ id: r.id as never, label: r.label })) as unknown as typeof STAGES : STAGES;
  const active = (Object.entries(stages) as [string, string][]).find(([, v]) => v === "active")?.[0];
  const activeLabel = list.find((x) => x.id === active)?.label;
  const title = repairing ? "Repairing your part" : "Checking your part";

  return (
    <div className="check-card" role="status" aria-live="polite">
      <div className="check-title">{title}</div>
      <div className="check-progress-track" style={{ height: 4, background: "var(--border)", borderRadius: 2, overflow: "hidden", marginBottom: 12 }}>
        <div className="check-progress-fill" style={{ width: `${progress}%`, height: "100%", background: "var(--accent)", transition: "width 0.2s ease" }} />
      </div>
      <div className="check-progress-text" style={{ fontSize: 12, opacity: 0.7, marginBottom: 8 }}>{progress > 0 && progress < 100 ? `${progress}%` : ""}</div>
      <ul className="check-stages">
        {list.map((s) => {
          const state = (stages as Record<string, string>)[s.id] ?? "pending";
          return (
            <li key={s.id} className={`check-stage check-stage-${state}`}>
              <span className={`check-icon check-icon-${state}`} aria-hidden="true">
                {state === "done" ? <CheckIcon size={12} /> : state === "warning" ? <AlertIcon size={12} /> : state === "error" ? <XIcon size={12} /> : state === "active" ? <span style={{ width: 10, height: 10, border: "2px solid currentColor", borderTopColor: "transparent", borderRadius: "50%", display: "inline-block" }} /> : null}
              </span>
              {s.label}
            </li>
          );
        })}
      </ul>
      <div className="check-status" aria-live="polite">{activeLabel ? `${activeLabel}…` : progress > 0 && progress < 100 ? `Uploading ${progress}%` : ""}</div>
    </div>
  );
}
