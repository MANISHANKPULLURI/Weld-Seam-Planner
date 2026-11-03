import { useStore } from "../../state/store";
import type { ProjectUnits } from "../../state/store";

export function UnitSelector() {
  const projectUnits = useStore((s) => s.projectUnits);
  const setProjectUnits = useStore((s) => s.setProjectUnits);
  const confirm = useStore((s) => s.confirmProjectUnits);
  const confirmed = useStore((s) => s.projectUnitsConfirmed);

  if (!projectUnits) return null;

  return (
    <div className="unit-selector">
      <div className="unit-selector-row">
        <span className="unit-selector-label">Project units</span>
        <div className="view-segmented" role="group" aria-label="Project units">
          <button type="button" aria-pressed={projectUnits === "mm"} onClick={() => setProjectUnits("mm")}>mm</button>
          <button type="button" aria-pressed={projectUnits === "inch"} onClick={() => setProjectUnits("inch")}>inch</button>
        </div>
        {!confirmed ? (
          <button type="button" className="btn-primary" onClick={confirm} style={{ height: 28, padding: "0 12px" }}>Confirm</button>
        ) : (
          <span className="unit-confirmed">Confirmed</span>
        )}
      </div>
      <span className="project-units-hint">Stored explicitly. Geometry is not scaled for viewport fitting.</span>
    </div>
  );
}
