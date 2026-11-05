import { useEffect, useState } from "react";
import { useStore } from "../state/store";
import { loadSaved } from "../lib/persist";
import { createProject, currentProjectId, saveProjectSnapshot, setOpenProject } from "../lib/persist";
import { useThemeSync } from "../lib/theme";
import { Logo } from "./Logo";
import { LockIcon } from "./icons";
import { ToggleTheme } from "../components/lightswind/toggle-theme";

type SavedSession = { fileName: string; savedAt: number } | null;

/**
 * render the landing page and saved-session resume
 */
export function Home() {
  useThemeSync();
  const [savedSession, setSavedSession] = useState<SavedSession | undefined>(undefined);
  const livePart = useStore((s) => (s.phase !== "empty" ? s.part : null));

  useEffect(() => {
    let live = true;
    void loadSaved().then((saved) => {
      if (!live) return;
      const fileName = saved?.data?.part?.fileName;
      setSavedSession(fileName ? { fileName, savedAt: saved.savedAt } : null);
    });
    return () => { live = false; };
  }, []);

  const recentName = livePart?.fileName ?? savedSession?.fileName ?? null;

  /**
   * open a blank project, stashing any open work into its own slot first
   */
  const openNew = async () => {
    const s = useStore.getState();
    const from = currentProjectId();
    if (from && s.phase !== "empty") await saveProjectSnapshot(from);
    const id = await createProject();
    if (id) setOpenProject(id);
    s.loadAnother();
    location.hash = "#/planner";
  };

  return (
    <div className="home-root">
      <header className="home-header">
        <div className="home-header-left">
          <span className="home-logo"><Logo height={18} /></span>
          <span className="brand-divider" aria-hidden="true" />
          <span className="home-logo-wordmark">Weld Seam Planner</span>
        </div>
        <ToggleTheme duration={500} animationType="circle-spread" />
      </header>
      <main className="home-main">
        <div className="home-column">
          <h1 className="home-title">Plan robotic welds from a 3D part</h1>
          <p className="home-subtitle">Load an STL, pick the seams, set how each one is welded, and export a job a robot controller can read.</p>
          <div className="home-cta-row">
            {savedSession === undefined && !livePart ? (
              <span className="home-cta" aria-disabled="true">Open the planner</span>
            ) : recentName ? (
              <>
                <button type="button" className="home-cta" onClick={() => void openNew()}>Open new planner</button>
                <a href="#/planner" className="home-continue">Continue {recentName}</a>
              </>
            ) : (
              <a href="#/planner" className="home-cta">Open the planner</a>
            )}
          </div>
          <div className="home-steps">
            <div className="home-step">
              <span className="home-step-num">1</span>
              <span className="home-step-title">Check the part</span>
              <span className="home-step-desc">We look for open edges, flipped faces and separate bodies.</span>
            </div>
            <div className="home-step">
              <span className="home-step-num">2</span>
              <span className="home-step-title">Choose the seams</span>
              <span className="home-step-desc">Click a detected edge or draw one by hand.</span>
            </div>
            <div className="home-step">
              <span className="home-step-num">3</span>
              <span className="home-step-title">Export the job</span>
              <span className="home-step-desc">A versioned JSON file with units, frames and parameters.</span>
            </div>
          </div>
          <div className="home-privacy">
            <LockIcon size={14} />
            Your STL is checked in your browser and never uploaded.
          </div>
          <svg className="home-deco" viewBox="0 0 640 48" fill="none" aria-hidden="true">
            <path d="M0 36H240M240 8V36M240 20H360M360 8V36" stroke="var(--rev-green-t3)" strokeWidth={1.4} />
            <path d="M240 20H360" stroke="var(--discovery)" strokeWidth={2} />
          </svg>
        </div>
      </main>
      <footer className="home-footer">Set in 42dot Sans, SIL Open Font License</footer>
    </div>
  );
}
