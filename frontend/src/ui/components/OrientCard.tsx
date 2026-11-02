import { useStore } from "../../state/store";


export function OrientCard() {

  const health = useStore((s) => s.health);
  const frame = useStore((s) => s.frame);
  const setUnits = useStore((s) => s.setUnits);
  const setUpAxis = useStore((s) => s.setUpAxis);
  const confirmFrame = useStore((s) => s.confirmFrame);

  if (!health) return null;

  const size = health.bounds.size;
  const diag = Math.hypot(size.x, size.y, size.z);

  return (
    <div className="orient-card" style={{ border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontWeight: 500 }}>Orient</div>
      <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
        Size {size.x.toFixed(2)} × {size.y.toFixed(2)} × {size.z.toFixed(2)} model units diagonal {diag.toFixed(2)}
      </div>
      <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
        <span>Units {frame.unitsGuessed ? "(guess)" : ""}</span>
        <select value={frame.units} onChange={(e) => setUnits(e.target.value as never)} style={{ height: 32, borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", background: "var(--bg-raised)", color: "var(--text)", padding: "0 8px" }}>
          <option value="mm">mm</option>
          <option value="cm">cm</option>
          <option value="m">m</option>
          <option value="inch">inch</option>
        </select>
      </label>
      <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
        <span>Up axis {frame.upGuessed ? "(guess)" : ""}</span>
        <select value={frame.upAxis} onChange={(e) => setUpAxis(e.target.value as never)} style={{ height: 32, borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", background: "var(--bg-raised)", color: "var(--text)", padding: "0 8px" }}>
          <option value="+z">+Z</option>
          <option value="+y">+Y</option>
        </select>
      </label>
      {!frame.confirmed && (
        <button type="button" className="btn-primary" onClick={confirmFrame}>
          Confirm units and up axis
        </button>
      )}
      {frame.confirmed && (
        <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Confirmed</div>
      )}
    </div>
  );
}
