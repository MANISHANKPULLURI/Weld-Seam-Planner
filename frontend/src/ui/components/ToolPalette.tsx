import { useStore } from "../../state/store";
import type { Tool } from "../../state/store";
import { PointerIcon, PencilIcon, EdgeIcon } from "../icons";

const TOOLS: { id: Tool; label: string; icon: React.ReactNode; hint: string }[] = [
  { id: "select", label: "Select", icon: <PointerIcon />, hint: "Click a seam to select it. Delete removes it, Esc clears the selection." },
  { id: "edge", label: "Edge chain", icon: <EdgeIcon />, hint: "Hover an edge to preview its chain, click to add it as a seam." },
  { id: "draw", label: "Draw", icon: <PencilIcon />, hint: "Click points on the part. Points snap to nearby corners. Enter or double-click to finish." },
];

export function ToolPalette() {
  const tool = useStore((s) => s.tool);
  const setTool = useStore((s) => s.setTool);
  const detected = useStore((s) => s.detection.status === "done");

  return (
    <div className="tool-stack">
      <div className="tool-palette" role="toolbar" aria-label="Seam tools">
        {TOOLS.map((t) => (
          <button key={t.id} type="button" className="tool-btn" aria-pressed={tool === t.id} onClick={() => setTool(t.id)} disabled={t.id === "edge" && !detected} title={t.id === "edge" && !detected ? "Run detection first to find edges" : undefined}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>
      <p className="tool-hint" aria-live="polite">{TOOLS.find((t) => t.id === tool)!.hint}</p>
    </div>
  );
}
