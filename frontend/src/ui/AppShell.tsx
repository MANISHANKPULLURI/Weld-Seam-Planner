import { Logo } from "./Logo";
import { ProjectSwitcher } from "./components/ProjectSwitcher";
import { ConfirmHost } from "./components/ConfirmHost";
import { WorkControls } from "./components/WorkControls";
import { ToggleTheme } from "../components/lightswind/toggle-theme";
import { useThemeSync } from "../lib/theme";
import { useStore } from "../state/store";
import type { Step } from "../state/store";

const STEPS: { id: Step; label: string }[] = [
  { id: "part", label: "Part" },
  { id: "seams", label: "Seams" },
  { id: "procedures", label: "Procedures" },
  { id: "sequence", label: "Sequence" },
  { id: "review", label: "Review" },
];

export function AppShell({ children, viewport }: { children: React.ReactNode; viewport: React.ReactNode }) {
  const phase = useStore((s) => s.phase);
  const step = useStore((s) => s.step);
  const frame = useStore((s) => s.frame);
  const setStep = useStore((s) => s.setStep);
  const checked = phase === "checked";
  const collapsed = useStore((s) => s.panelCollapsed);
  useThemeSync();

  return (
    <div className={`planner-root${collapsed ? " planner-root-panel-collapsed" : ""}`}>
      <ConfirmHost />
      <header className="planner-topbar planner-topbar-split">
        <div className="planner-topbar-group planner-topbar-left-group">
          <a href="#/" className="planner-topbar-left" aria-label="Armatrix home">
            <Logo height={14} />
          </a>
          <ProjectSwitcher />
        </div>
        <span className="planner-wordmark planner-wordmark-center">Weld Seam Planner</span>
        <div className="planner-topbar-right">
          <WorkControls />
          <ToggleTheme duration={500} animationType="circle-spread" />
        </div>
      </header>
      <aside id="planner-panel" className="planner-panel" aria-hidden={collapsed}>
        <ol className="step-timeline" aria-label="Steps">
          {STEPS.map((s, idx) => {
            const isActive = step === s.id;
            const isLocked = s.id !== "part" && !checked;
            const done = STEPS.findIndex((x) => x.id === step) > idx;
            return (
              <li key={s.id} className={`step-node${isActive ? " step-node-active" : ""}${done ? " step-node-done" : ""}${isLocked ? " step-node-locked" : ""}`}>
                <button
                  type="button"
                  className="step-dot"
                  aria-current={isActive ? "step" : undefined}
                  aria-label={`${idx + 1}. ${s.label}${isActive ? " (current step)" : ""}${isLocked ? " (locked)" : ""}`}
                  title={isLocked ? `${s.label} — load a part first` : `${s.label} (${idx + 1})`}
                  onClick={() => { if (!isLocked) setStep(s.id); }}
                  disabled={isLocked}
                >
                  <span aria-hidden="true">{idx + 1}</span>
                </button>
                <span className="step-node-label" aria-hidden="true">{s.label}</span>
              </li>
            );
          })}
        </ol>
        <div className="planner-panel-content">{children}</div>
      </aside>
      <div className="planner-viewport">{viewport}</div>
    </div>
  );
}
