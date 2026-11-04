import { DetectCard } from "../components/DetectCard";
import { ToolPalette } from "../components/ToolPalette";
import { SeamList } from "../components/SeamList";
import { SeamDetails } from "../components/SeamDetails";
import { BodiesCard } from "../components/BodiesCard";
import { SeamGuide } from "../components/SeamGuide";

export function SeamsStep() {
  return (
    <div className="seams-stack">
      <SeamDetails />
      <SeamGuide />
      <DetectCard />
      <ToolPalette />
      <SeamList />
      <BodiesCard />
    </div>
  );
}
