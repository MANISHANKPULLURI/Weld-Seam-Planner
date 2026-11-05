import { StepNav } from "../components/StepNav";
import { useStore } from "../../state/store";
import { DropZone } from "../components/DropZone";
import { CheckProgress } from "../components/CheckProgress";
import { HealthCard } from "../components/HealthCard";
import { OrientCard } from "../components/OrientCard";

/**
 * render the part step for the current phase
 */
export function PartStep() {
  const phase = useStore((s) => s.phase);
  if (phase === "analysing" || phase === "repairing") return <CheckProgress />;
  if (phase === "checked" || phase === "error") return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <HealthCard />
      <OrientCard />
      {phase === "checked" && <StepNav note="Next finds the weld seams. Going on accepts the units and up axis above." />}
    </div>
  );
  return <DropZone />;
}
