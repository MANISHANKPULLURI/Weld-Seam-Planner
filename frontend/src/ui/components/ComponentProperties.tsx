import { useStore } from "../../state/store";
import type { Vec3 } from "../../state/store";

const MATERIALS = [
  { value: "Steel", grades: ["S235", "S355", "S460", "A36"] },
  { value: "Aluminium", grades: ["6061", "5083", "7075"] },
  { value: "Stainless", grades: ["304", "316", " duplex"] },
  { value: "Titanium", grades: ["Grade 2", "Grade 5"] },
];

export function ComponentProperties() {
  const selectedId = useStore((s) => s.selectedComponentId);
  const components = useStore((s) => s.components);
  const comp = components.find((c) => c.id === selectedId) ?? null;
  const renameComponent = useStore((s) => s.renameComponent);
  const setVisibility = useStore((s) => s.setComponentVisibility);
  const toggleLock = useStore((s) => s.toggleLock);
  const setTransform = useStore((s) => s.setComponentTransform);
  const resetTransform = useStore((s) => s.resetComponentTransform);
  const setMaterial = useStore((s) => s.setComponentMaterial);
  const setThickness = useStore((s) => s.setComponentThickness);
  const setMode = useStore((s) => s.setTransformMode);
  const transformMode = useStore((s) => s.transformMode);

  if (!comp) return <div className="component-empty">Select a component to inspect and configure.</div>;

  function updatePos(axis: keyof Vec3, value: string) {
    const num = Number(value);
    if (!Number.isFinite(num)) return;
    const next = { ...comp!.transform, position: { ...comp!.transform.position, [axis]: num } };
    setTransform(comp!.id, next);
  }
  function updateRot(axis: keyof Vec3, value: string) {
    const num = Number(value);
    if (!Number.isFinite(num)) return;
    const next = { ...comp!.transform, rotation: { ...comp!.transform.rotation, [axis]: num } };
    setTransform(comp!.id, next);
  }

  const locked = comp.locked;

  return (
    <div className="component-properties">
      <div className="prop-header">
        <input className="prop-name-input" value={comp.name} onChange={(e) => renameComponent(comp.id, e.target.value)} disabled={locked} />
        <span className="prop-filename">{comp.originalFilename}</span>
      </div>

      <div className="prop-group">
        <label className="prop-label">Material</label>
        <div className="prop-row">
          <select className="prop-select" value={comp.material} onChange={(e) => { const m = e.target.value; const g = MATERIALS.find((x) => x.value === m)?.grades[0] ?? comp.materialGrade; setMaterial(comp.id, m, g); }} disabled={locked}>
            {MATERIALS.map((m) => <option key={m.value} value={m.value}>{m.value}</option>)}
          </select>
          <select className="prop-select" value={comp.materialGrade} onChange={(e) => setMaterial(comp.id, comp.material, e.target.value)} disabled={locked}>
            {(MATERIALS.find((m) => m.value === comp.material)?.grades ?? [comp.materialGrade]).map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>
      </div>

      <div className="prop-group">
        <label className="prop-label">Thickness (mm)</label>
        <input className="prop-input" type="number" step="0.1" value={comp.thickness ?? ""} placeholder="—" onChange={(e) => { const v = e.target.value === "" ? null : Number(e.target.value); if (v === null || Number.isFinite(v)) setThickness(comp.id, v); }} disabled={locked} />
      </div>

      <div className="prop-group">
        <label className="prop-label">Visibility / Lock</label>
        <div className="prop-row">
          <label className="prop-check"><input type="checkbox" checked={comp.visible} onChange={(e) => setVisibility(comp.id, e.target.checked)} /> Visible</label>
          <label className="prop-check"><input type="checkbox" checked={comp.locked} onChange={() => toggleLock(comp.id)} /> Locked</label>
        </div>
      </div>

      <div className="prop-group">
        <div className="prop-label-row">
          <label className="prop-label">Transform</label>
          <div className="view-segmented" role="group" aria-label="Transform mode">
            <button type="button" aria-pressed={transformMode === "translate"} onClick={() => setMode("translate")} disabled={locked}>Move</button>
            <button type="button" aria-pressed={transformMode === "rotate"} onClick={() => setMode("rotate")} disabled={locked}>Rotate</button>
          </div>
        </div>
        <div className="prop-grid">
          <span className="prop-axis-label">X</span>
          <input className="prop-input" type="number" step="1" value={comp.transform.position.x.toFixed(2)} onChange={(e) => updatePos("x", e.target.value)} disabled={locked} />
          <input className="prop-input" type="number" step="1" value={comp.transform.rotation.x.toFixed(1)} onChange={(e) => updateRot("x", e.target.value)} disabled={locked} />
          <span className="prop-axis-label">Y</span>
          <input className="prop-input" type="number" step="1" value={comp.transform.position.y.toFixed(2)} onChange={(e) => updatePos("y", e.target.value)} disabled={locked} />
          <input className="prop-input" type="number" step="1" value={comp.transform.rotation.y.toFixed(1)} onChange={(e) => updateRot("y", e.target.value)} disabled={locked} />
          <span className="prop-axis-label">Z</span>
          <input className="prop-input" type="number" step="1" value={comp.transform.position.z.toFixed(2)} onChange={(e) => updatePos("z", e.target.value)} disabled={locked} />
          <input className="prop-input" type="number" step="1" value={comp.transform.rotation.z.toFixed(1)} onChange={(e) => updateRot("z", e.target.value)} disabled={locked} />
        </div>
        <div className="prop-row" style={{ marginTop: 8 }}>
          <button type="button" className="btn-ghost" onClick={() => resetTransform(comp.id)} disabled={locked}>Reset transform</button>
          <span className="prop-hint">Units: {comp.units} · Local preserved</span>
        </div>
      </div>

      <div className="prop-group">
        <label className="prop-label">Geometry</label>
        <div className="prop-meta numeric">{comp.triangleCount} tris · {comp.vertexCount} verts</div>
        <div className="prop-meta numeric">Bounds {comp.bounds.size.x.toFixed(1)}×{comp.bounds.size.y.toFixed(1)}×{comp.bounds.size.z.toFixed(1)} {comp.units}</div>
      </div>
    </div>
  );
}
