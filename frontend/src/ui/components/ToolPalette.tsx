import { useStore } from "../../state/store";
import type { Tool } from "../../state/store";
import { detectWithSettings } from "../../lib/meshClient";
import { PointerIcon, PencilIcon, EdgeIcon } from "../icons";

const TOOLS: { id: Tool; label: string; icon: React.ReactNode; hint: string }[] = [
  { id: "select", label: "Select", icon: <PointerIcon />, hint: "Click a seam to select it. V reverses the selected seam, Delete removes it, Esc clears the selection." },
  { id: "edge", label: "Pick edge", icon: <EdgeIcon />, hint: "Move over any edge of the part: the whole connected edge lights up orange. Click to add it as a seam. (E)" },
  { id: "draw", label: "Draw", icon: <PencilIcon />, hint: "Click points on the part to trace a seam. Points snap to seam ends, corners and edges, shown by the orange dot. Enter or double-click to finish, Backspace undoes a point. (D)" },
];

/**
 * pick the select, edge or draw tool
 */
export function ToolPalette() {
  const tool = useStore((s) => s.tool);
  const setTool = useStore((s) => s.setTool);
  const needsEdges = useStore((s) => s.detection.status === "idle" || s.detection.status === "error");

  
  /**
   * activate a tool, detecting edges first if needed
   */
  function choose(id: Tool) {
    if ((id === "edge" || id === "draw") && needsEdges) detectWithSettings();
    setTool(id);
  }

  return (
    <div className="tool-stack">
      <div className="tool-palette" role="toolbar" aria-label="Seam tools">
        {TOOLS.map((t) => (
          <button key={t.id} type="button" className="tool-btn" aria-pressed={tool === t.id} onClick={() => choose(t.id)} title={`${t.label}${t.id === "edge" ? " (E)" : t.id === "draw" ? " (D)" : ""}`}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>
      <p className="tool-hint" aria-live="polite">{TOOLS.find((t) => t.id === tool)!.hint} Press ? for all shortcuts.</p>
    </div>
  );
}
