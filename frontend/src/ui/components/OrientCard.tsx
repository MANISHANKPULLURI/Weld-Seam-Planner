import { partSizeMm } from "@weld/core";
import { useStore } from "../../state/store";
import type { Units, UpAxis } from "../../state/store";
import { formatSize } from "../../domain/mesh/describe";
import { CheckIcon } from "../icons";
import { MenuSelect } from "./MenuSelect";

const UP_LABEL: Record<UpAxis, string> = { "+z": "+Z", "+y": "+Y" };

/**
 * confirm units and up axis for the part
 */
export function OrientCard() {
  const health = useStore((s) => s.health);
  const frame = useStore((s) => s.frame);
  const setUnits = useStore((s) => s.setUnits);
  const setUpAxis = useStore((s) => s.setUpAxis);
  const confirmFrame = useStore((s) => s.confirmFrame);

  if (!health) return null;

  const sizeMm = partSizeMm(health.bounds.size, frame.units, frame.upAxis);
  const guessed = !frame.confirmed && (frame.unitsGuessed || frame.upGuessed);

  return (
    <section className="result-card">
      <header className="result-header">
        <span className="result-title">Units and orientation</span>
        <span className={`status-badge ${frame.confirmed ? "status-badge-ok" : guessed ? "status-badge-warn" : "status-badge-neutral"}`}>
          {frame.confirmed ? "Confirmed" : guessed ? "Guessed" : "Not confirmed"}
        </span>
      </header>

      <p className="result-explainer">STL files carry no units. Check that the size below matches the real part. The model updates as you change these.</p>

      <div className="field-grid">
        <MenuSelect<Units> label="File units" value={frame.units} onChange={(v) => setUnits(v)} options={[
          { value: "mm", label: "Millimetres" },
          { value: "cm", label: "Centimetres" },
          { value: "m", label: "Metres" },
          { value: "inch", label: "Inches" },
        ]} />
        <MenuSelect<UpAxis> label="Up axis in the file" value={frame.upAxis} onChange={(v) => setUpAxis(v)} options={[
          { value: "+z", label: "+Z (most CAD)" },
          { value: "+y", label: "+Y" },
        ]} />
      </div>

      <dl className="health-summary">
        <div><dt>Real size <span className="health-unit">mm</span></dt><dd className="numeric">{formatSize(sizeMm)}</dd></div>
      </dl>

      {frame.unitsNote && !frame.confirmed && <p className="field-note" role="note">{frame.unitsNote}</p>}

      {frame.confirmed ? (
        <p className="result-confirmed"><CheckIcon size={12} /> Planning in millimetres, Z up.</p>
      ) : (
        <button type="button" className="btn-primary btn-block" onClick={confirmFrame}>
          Confirm {frame.units === "inch" ? "inches" : frame.units}, {UP_LABEL[frame.upAxis]} up
        </button>
      )}
    </section>
  );
}
