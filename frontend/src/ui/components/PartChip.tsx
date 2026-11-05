import { useStore } from "../../state/store";
import { formatCount } from "../../domain/mesh/describe";

/**
 * show the loaded part name, size and units state
 */
export function PartChip() {
  const part = useStore((s) => s.part);
  const health = useStore((s) => s.health);
  const frame = useStore((s) => s.frame);
  const phase = useStore((s) => s.phase);

  if (!part) return null;

  const ready = phase === "checked" && health;

  return (
    <span className="part-chip" title={part.fileName}>
      <span className="part-chip-name">{part.fileName}</span>
      {ready && <span className="part-chip-meta numeric">{formatCount(health.triangles)} triangles</span>}
      {ready && (frame.confirmed
        ? <span className="part-chip-meta">{frame.units}, Z up</span>
        : <span className="part-chip-meta part-chip-warn">Units not confirmed</span>)}
    </span>
  );
}
