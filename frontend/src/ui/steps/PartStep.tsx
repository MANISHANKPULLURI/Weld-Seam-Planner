import { useStore } from "../../state/store";
import { DropZone } from "../components/DropZone";
import { CheckProgress } from "../components/CheckProgress";
import { HealthCard } from "../components/HealthCard";

export function PartStep() {
  const phase = useStore((s) => s.phase);
  if (phase === "analysing" || phase === "repairing") return <CheckProgress />;
  if (phase === "checked" || phase === "error") return <HealthCard />;
  return <DropZone />;
}
