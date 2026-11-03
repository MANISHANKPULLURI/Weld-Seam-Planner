import { useEffect, useState } from "react";
import { Logo } from "./Logo";
import { LocalOnlyChip } from "./components/LocalOnlyChip";
import { useStore } from "../state/store";
import type { Step } from "../state/store";
import { PanelLeftIcon, ChevronLeftIcon, ChevronRightIcon } from "./icons";

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
  const fileName = useStore((s) => s.fileName);
  const frame = useStore((s) => s.frame);
  const setStep = useStore((s) => s.setStep);
  const checked = phase === "checked";
  const [collapsed, setCollapsed] = useState(false);
  const [theme, setTheme] = useState(() => (typeof document !== "undefined" ? document.documentElement.getAttribute("data-theme") || "dark" : "dark"));
  const projectId = useStore((s) => s.projectId);
  const clearProject = useStore((s) => s.clearProject);
  useEffect(() => {
    if (typeof document !== "undefined" && !document.documentElement.getAttribute("data-theme")) {
      document.documentElement.setAttribute("data-theme", "dark");
    }
  }, []);

  return (
    <div className={`planner-root${collapsed ? " planner-root-panel-collapsed" : ""}`}>
      <header className="planner-topbar">
        <div className="planner-topbar-group">
          <a href="#/" className="planner-topbar-left">
            <Logo size={22} />
            <span className="planner-wordmark">Weld planner</span>
          </a>
          <button type="button" className="planner-collapse-btn" aria-expanded={!collapsed} aria-controls="planner-panel" onClick={() => setCollapsed((v) => !v)} aria-label={collapsed ? "Open settings panel" : "Close settings panel"}>
            {collapsed ? <ChevronRightIcon /> : <ChevronLeftIcon />}
            <PanelLeftIcon size={14} />
            {collapsed ? "Show panel" : "Hide panel"}
          </button>
          <button type="button" className="planner-collapse-btn" onClick={() => { const next = theme === "dark" ? "light" : "dark"; setTheme(next); document.documentElement.setAttribute("data-theme", next); window.dispatchEvent(new CustomEvent("themechange")); }} aria-label="Toggle theme">
            {theme === "dark" ? "Light mode" : "Dark mode"}
          </button>
        </div>
        {projectId && (
          <button type="button" className="planner-collapse-btn" onClick={() => { clearProject(); useStore.getState().loadAnother(); }} aria-label="New project" title="Start new project">
            New project
          </button>
        )}
        {fileName && <span className="planner-filechip" title={fileName}>{fileName}</span>}
        <LocalOnlyChip />
      </header>
      <aside id="planner-panel" className="planner-panel" aria-hidden={collapsed}>
        <ol className="planner-steps" aria-label="Steps">
          {STEPS.map((s, idx) => {
            const isActive = step === s.id;
            const isLocked = s.id !== "part" && (!checked || !frame.confirmed);
            return (
              <li key={s.id}>
                <button
                  type="button"
                  className={`planner-step${isActive ? " planner-step-active" : ""}${isLocked ? " planner-step-locked" : ""}`}
                  aria-current={isActive ? "step" : undefined}
                  aria-disabled={isLocked}
                  title={isLocked ? "Load a part first" : undefined}
                  onClick={() => { if (!isLocked) setStep(s.id); }}
                  disabled={isLocked}
                >
                  <span className="planner-step-index">{idx + 1}</span>
                  <span className="planner-step-label">{s.label}</span>
                </button>
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
