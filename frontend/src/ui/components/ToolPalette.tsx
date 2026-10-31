import { useStore } from "../../state/store";
import { PointerIcon, PencilIcon } from "../icons";

export function ToolPalette() {
  const tool = useStore((s) => s.tool);
  const setTool = useStore((s) => s.setTool);
  const hint = tool === "select" ? "Click a seam to select it. Shift-click to add more." : "Click points on the part's surface. Double-click to finish.";

  return (
    <div>
      <div className="tool-palette" role="toolbar" aria-label="Seam tools">
        <button type="button" className="tool-btn" aria-pressed={tool === "select"} onClick={() => setTool("select")}>
          <PointerIcon /> Select
        </button>
        <button type="button" className="tool-btn" aria-pressed={tool === "draw"} onClick={() => setTool("draw")}>
          <PencilIcon /> Draw seam
        </button>
      </div>
      <div className="tool-hint" aria-live="polite">{hint}</div>
    </div>
  );
}
