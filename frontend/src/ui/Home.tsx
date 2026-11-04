import { Logo } from "./Logo";
import { LockIcon } from "./icons";

export function Home() {
  const toggle = () => {
    const cur = document.documentElement.getAttribute("data-theme") || "dark";
    const next = cur === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
  };
  return (
    <div className="home-root">
      <header className="home-header">
        <div className="home-header-left">
          <span className="home-logo"><Logo height={18} /></span>
          <span className="brand-divider" aria-hidden="true" />
          <span className="home-logo-wordmark">Weld Seam Planner</span>
        </div>
        <button type="button" className="planner-collapse-btn" onClick={toggle}>Toggle theme</button>
      </header>
      <main className="home-main">
        <div className="home-column">
          <h1 className="home-title">Plan robotic welds from a 3D part</h1>
          <p className="home-subtitle">Load an STL, pick the seams, set how each one is welded, and export a job a robot controller can read.</p>
          <a href="#/planner" className="home-cta">Open the planner</a>
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
