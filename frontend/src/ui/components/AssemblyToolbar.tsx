import { useStore } from "../../state/store";
import { distanceBetween } from "../../viewer/assemblyMath";

export function AssemblyToolbar({ controller }: { controller: { fitModel: (a?: boolean) => void; fitSelected: () => void } | null }) {
  const components = useStore((s) => s.components);
  const selectedId = useStore((s) => s.selectedComponentId);
  const exploded = useStore((s) => s.explodedFactor);
  const setExploded = useStore((s) => s.setExplodedFactor);
  const isolatedId = useStore((s) => s.isolatedComponentId);
  const isolate = useStore((s) => s.isolateComponent);
  const transformMode = useStore((s) => s.transformMode);
  const setMode = useStore((s) => s.setTransformMode);

  const visibleCount = components.filter((c) => c.visible).length;
  const assemblyBounds = (() => {
    const vals = components.filter((c) => c.visible && c.status === "validated");
    if (vals.length === 0) return null;
    let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (const c of vals) {
      const b = c.bounds;
      const tx = c.transform.position;
      const rx: number = c.transform.rotation.x, ry = c.transform.rotation.y, rz = c.transform.rotation.z;
      void rx; void ry; void rz;
      const offMin = { x: b.min.x + tx.x, y: b.min.y + tx.y, z: b.min.z + tx.z };
      const offMax = { x: b.max.x + tx.x, y: b.max.y + tx.y, z: b.max.z + tx.z };
      minX = Math.min(minX, offMin.x); minY = Math.min(minY, offMin.y); minZ = Math.min(minZ, offMin.z);
      maxX = Math.max(maxX, offMax.x); maxY = Math.max(maxY, offMax.y); maxZ = Math.max(maxZ, offMax.z);
    }
    return { size: { x: maxX - minX, y: maxY - minY, z: maxZ - minZ } };
  })();

  const selected = components.find((c) => c.id === selectedId);
  const measure = (() => {
    if (!selected) return null;
    const selCenter = { x: (selected.bounds.min.x + selected.bounds.max.x) / 2 + selected.transform.position.x, y: (selected.bounds.min.y + selected.bounds.max.y) / 2 + selected.transform.position.y, z: (selected.bounds.min.z + selected.bounds.max.z) / 2 + selected.transform.position.z };
    let nearest: number | null = null;
    for (const c of components) {
      if (c.id === selected.id || !c.visible) continue;
      const cc = { x: (c.bounds.min.x + c.bounds.max.x) / 2 + c.transform.position.x, y: (c.bounds.min.y + c.bounds.max.y) / 2 + c.transform.position.y, z: (c.bounds.min.z + c.bounds.max.z) / 2 + c.transform.position.z };
      const d = distanceBetween(selCenter as unknown as { x: number; y: number; z: number }, cc as unknown as { x: number; y: number; z: number });
      if (nearest === null || d < nearest) nearest = d;
    }
    return nearest;
  })();

  return (
    <div className="assembly-toolbar">
      <div className="assembly-toolbar-row">
        <button type="button" className="btn-ghost" onClick={() => controller?.fitModel(true)}>Fit assembly</button>
        <button type="button" className="btn-ghost" disabled={!selectedId} onClick={() => controller?.fitSelected()}>Fit selected</button>
        <button type="button" className="btn-ghost" onClick={() => { if (isolatedId) isolate(null); }}>Show all</button>
        <span className="assembly-toolbar-meta">{visibleCount}/{components.length} visible</span>
      </div>
      <div className="assembly-toolbar-row">
        <div className="view-segmented" role="group" aria-label="Gizmo mode">
          <button type="button" aria-pressed={transformMode === "translate"} onClick={() => setMode("translate")}>Translate</button>
          <button type="button" aria-pressed={transformMode === "rotate"} onClick={() => setMode("rotate")}>Rotate</button>
        </div>
        <label className="assembly-exploded-label">Exploded
          <input type="range" min={0} max={2} step={0.1} value={exploded} onChange={(e) => setExploded(Number(e.target.value))} />
          <span className="numeric">{exploded.toFixed(1)}</span>
        </label>
      </div>
      {assemblyBounds && <div className="assembly-bounds numeric">Assembly {assemblyBounds.size.x.toFixed(1)}×{assemblyBounds.size.y.toFixed(1)}×{assemblyBounds.size.z.toFixed(1)}</div>}
      {measure !== null && <div className="assembly-measure numeric">Nearest distance: {measure.toFixed(2)} {selected?.units}</div>}
    </div>
  );
}
