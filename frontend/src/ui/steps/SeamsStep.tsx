import { ToolPalette } from "../components/ToolPalette";
import { SeamList } from "../components/SeamList";
import { useStore } from "../../state/store";

export function SeamsStep() {
  const setStep = useStore((s) => s.setStep);
  return (
    <div className="seams-stack">
      <div className="seams-header">
        <h2 className="seams-title">Seams</h2>
        <p className="seams-helper">Choose how to find the weld lines on this part.</p>
      </div>
      <ToolPalette />
      <SeamList />
      <button type="button" className="btn-secondary" onClick={() => setStep("part")}>Back to part</button>
    </div>
  );
}
