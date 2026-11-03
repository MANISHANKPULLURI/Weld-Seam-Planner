import { useState } from "react";
import { useStore } from "../../state/store";
import type { ProjectUnits, InputMode } from "../../state/store";
import { CubeIcon, GridIcon } from "../icons";

export function ProjectCreation() {
  const createProject = useStore((s) => s.createProject);
  const [units, setUnits] = useState<ProjectUnits>("mm");

  function start(mode: InputMode) {
    createProject(mode, units);
  }

  return (
    <div className="project-creation">
      <div className="project-creation-header">
        <h2 className="project-creation-title">Create New Project</h2>
        <p className="project-creation-subtitle">Choose how you want to import geometry for weld planning.</p>
      </div>

      <div className="project-creation-units">
        <label className="project-units-label">Physical units</label>
        <div className="view-segmented" role="group" aria-label="Units">
          <button type="button" aria-pressed={units === "mm"} onClick={() => setUnits("mm")} title="Millimetres">mm</button>
          <button type="button" aria-pressed={units === "inch"} onClick={() => setUnits("inch")} title="Inches">inch</button>
        </div>
        <span className="project-units-hint">STL has no reliable units. Your selection is stored explicitly and never guessed.</span>
      </div>

      <div className="project-cards">
        <button type="button" className="project-card" onClick={() => start("single")} aria-label="Create Single STL project">
          <div className="project-card-icon"><CubeIcon size={28} /></div>
          <h3 className="project-card-title">Single STL</h3>
          <p className="project-card-desc">Upload one STL file containing an individual part or a pre-combined assembly. Inspect its geometry and prepare it for weld planning.</p>
          <span className="project-card-cta">Select Single STL</span>
        </button>

        <button type="button" className="project-card" onClick={() => start("multiple")} aria-label="Create Multiple STL project">
          <div className="project-card-icon"><GridIcon size={28} /></div>
          <h3 className="project-card-title">Multiple STL</h3>
          <p className="project-card-desc">Upload separate STL files representing individual physical components. These components can subsequently be positioned and configured together as an assembly for welding planning.</p>
          <span className="project-card-cta">Select Multiple STL</span>
        </button>
      </div>
    </div>
  );
}
