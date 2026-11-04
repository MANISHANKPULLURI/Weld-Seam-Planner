import { DetectCard } from "../components/DetectCard";
import { ToolPalette } from "../components/ToolPalette";
import { SeamList } from "../components/SeamList";
import { SeamDetails } from "../components/SeamDetails";
import { BodiesCard } from "../components/BodiesCard";
import { SeamGuide } from "../components/SeamGuide";
import { StepNav } from "../components/StepNav";
import { CandidateReview } from "../components/CandidateReview";
import { useStore } from "../../state/store";

export function SeamsStep() {
  const kept = useStore((s) => s.seams.filter((x) => x.status === "accepted").length);
  const reviewing = useStore((s) => s.reviewing);
  const setReviewing = useStore((s) => s.setReviewing);
  if (reviewing) return <div className="seams-stack"><CandidateReview onClose={() => setReviewing(false)} /></div>;
  return (
    <div className="seams-stack">
      <SeamDetails />
      <SeamGuide />
      <DetectCard />
      <ToolPalette />
      <SeamList />
      <BodiesCard />
      <StepNav note={kept ? `${kept} seam${kept === 1 ? "" : "s"} kept. Next: give them weld parameters.` : "Keep at least one seam (✓) before setting parameters."} />
    </div>
  );
}
