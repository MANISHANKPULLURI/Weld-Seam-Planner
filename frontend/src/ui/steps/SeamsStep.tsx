import { DetectCard } from "../components/DetectCard";
import { ToolPalette } from "../components/ToolPalette";
import { SeamList } from "../components/SeamList";
import { SeamDetails } from "../components/SeamDetails";
import { BodiesCard } from "../components/BodiesCard";

export function SeamsStep() {
  return (
    <div className="seams-stack">
      <DetectCard />
      <ToolPalette />
      <SeamDetails />
      <SeamList />
      <BodiesCard />
    </div>
  );
}
