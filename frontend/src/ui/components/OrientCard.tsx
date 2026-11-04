import { useStore } from "../../state/store";
import type { Units, UpAxis } from "../../state/store";
import { formatSize } from "../../domain/mesh/describe";
import { CheckIcon } from "../icons";

const MM_PER_UNIT: Record<Units, number> = { mm: 1, cm: 10, m: 1000, inch: 25.4 };

export function OrientCard() {
  const health = useStore((s) => s.health);
  const frame = useStore((s) => s.frame);
  const setUnits = useStore((s) => s.setUnits);
  const setUpAxis = useStore((s) => s.setUpAxis);
  const confirmFrame = useStore((s) => s.confirmFrame);

  if (!health) return null;

  const scale = MM_PER_UNIT[frame.units];
  const sizeMm = { x: health.bounds.size.x * scale, y: health.bounds.size.y * scale, z: health.bounds.size.z * scale };
  const guessed = !frame.confirmed && (frame.unitsGuessed || frame.upGuessed);

  return (
    <section className="result-card">
      <header className="result-header">
        <span className="result-title">Units and orientation</span>
        <span className={`status-badge ${frame.confirmed ? "status-badge-ok" : guessed ? "status-badge-warn" : "status-badge-neutral"}`}>
          {frame.confirmed ? "Confirmed" : guessed ? "Guessed" : "Not confirmed"}
        </span>
      </header>

      <div className="field-grid">
        <label className="field">
          <span className="field-label">File units</span>
          <select className="field-control" value={frame.units} onChange={(e) => setUnits(e.target.value as Units)}>
            <option value="mm">mm</option>
            <option value="cm">cm</option>
            <option value="m">m</option>
            <option value="inch">inch</option>
          </select>
        </label>
        <label className="field">
          <span className="field-label">Up axis</span>
          <select className="field-control" value={frame.upAxis} onChange={(e) => setUpAxis(e.target.value as UpAxis)}>
            <option value="+z">+Z</option>
            <option value="+y">+Y</option>
          </select>
        </label>
      </div>

      <dl className="health-summary">
        <div><dt>Size <span className="health-unit">mm</span></dt><dd className="numeric">{formatSize(sizeMm)}</dd></div>
      </dl>

      {frame.unitsNote && !frame.confirmed && <p className="field-note" role="note">{frame.unitsNote}</p>}

      {frame.confirmed ? (
        <p className="result-confirmed"><CheckIcon size={12} /> Units and up axis confirmed.</p>
      ) : (
        <button type="button" className="btn-primary btn-block" onClick={confirmFrame}>Confirm units and up axis</button>
      )}
    </section>
  );
}
