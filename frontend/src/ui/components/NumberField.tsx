type Props = {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  unit?: string;
  hint?: string;
  step?: number;
  min?: number;
  placeholder?: string;
  overridden?: boolean;
  onReset?: () => void;
};


/**
 * render a labelled numeric input with reset
 */
export function NumberField({ label, value, onChange, unit, hint, step = 1, min = 0, placeholder, overridden, onReset }: Props) {
  return (
    <label className={`field${overridden ? " field-overridden" : ""}`} title={hint}>
      <span className="field-label">
        {label}{unit ? ` (${unit})` : ""}
        {overridden && onReset && <button type="button" className="btn-link field-reset" onClick={(e) => { e.preventDefault(); onReset(); }}>Reset</button>}
      </span>
      <input
        className="field-control numeric"
        type="number"
        step={step}
        min={min}
        placeholder={placeholder}
        value={value ?? ""}
        onChange={(e) => {
          if (e.target.value === "") return onChange(null);
          const v = Number(e.target.value);
          if (Number.isFinite(v)) onChange(Math.max(min, v));
        }}
      />
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}
