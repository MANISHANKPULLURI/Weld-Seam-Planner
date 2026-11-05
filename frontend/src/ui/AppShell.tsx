import { useState } from "react";
import { Logo } from "./Logo";
import { WorkControls } from "./components/WorkControls";
import { useStore } from "../state/store";
import type { Step } from "../state/store";
import { SunIcon, MoonIcon } from "./icons";

const STEPS: { id: Step; label: string }[] = [
  { id: "part", label: "Part" },
  { id: "seams", label: "Seams" },
  { id: "procedures", label: "Procedures" },
  { id: "sequence", label: "Sequence" },
  { id: "review", label: "Review" },
];

/**
 * render the planner frame with steps and viewport
 */
export function AppShell({ children, viewport }: { children: React.ReactNode; viewport: React.ReactNode }) {
  const phase = useStore((s) => s.phase);
  const step = useStore((s) => s.step);
  const frame = useStore((s) => s.frame);
  const setStep = useStore((s) => s.setStep);
  const checked = phase === "checked";
  const collapsed = useStore((s) => s.panelCollapsed);
  const [theme, setTheme] = useState(() => (typeof document !== "undefined" ? document.documentElement.getAttribute("data-theme") || "dark" : "dark"));
  if (typeof document !== "undefined" && !document.documentElement.getAttribute("data-theme")) {
    document.documentElement.setAttribute("data-theme", "dark");
  }

  return (
    <div className={`planner-root${collapsed ? " planner-root-panel-collapsed" : ""}`}>
      <header className="planner-topbar planner-topbar-split">
        <a href="#/" className="planner-topbar-left" aria-label="Armatrix home">
          <Logo height={14} />
        </a>
        <span className="planner-wordmark planner-wordmark-center">Weld Seam Planner</span>
        <div className="planner-topbar-right">
          <WorkControls />
          <button type="button" className="theme-toggle" onClick={() => { const next = theme === "dark" ? "light" : "dark"; setTheme(next); document.documentElement.setAttribute("data-theme", next); window.dispatchEvent(new CustomEvent("themechange")); }} aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"} title={theme === "dark" ? "Light mode" : "Dark mode"}>
            <span key={theme} className="theme-toggle-icon">{theme === "dark" ? <SunIcon size={16} /> : <MoonIcon size={16} />}</span>
          </button>
        </div>
      </header>
      <aside id="planner-panel" className="planner-panel" aria-hidden={collapsed}>
        <ol className="planner-steps" aria-label="Steps">
          {STEPS.map((s, idx) => {
            const isActive = step === s.id;
            const isLocked = s.id !== "part" && !checked;
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
