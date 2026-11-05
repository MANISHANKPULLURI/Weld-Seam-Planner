import { useEffect, useRef } from "react";

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
  inline?: boolean;
};

export function NumberField({ label, value, onChange, unit, hint, step = 1, min = 0, placeholder, overridden, onReset, inline }: Props) {
  const acc = useRef<number | null>(null);
  const timers = useRef<{ t?: number; i?: number }>({});
  const stop = () => { window.clearTimeout(timers.current.t); window.clearInterval(timers.current.i); timers.current = {}; acc.current = null; };
  useEffect(() => () => stop(), []);
  const stepBy = (dir: 1 | -1) => {
    const base = acc.current ?? value ?? min;
    const next = Math.max(min, Number(((base + dir * step) / step).toFixed(6)) * step);
    acc.current = next;
    onChange(next);
  };
  const beginHold = (dir: 1 | -1) => (e: React.MouseEvent) => {
    e.preventDefault();
    stepBy(dir);
    timers.current.t = window.setTimeout(() => {
      timers.current.i = window.setInterval(() => stepBy(dir), 70);
    }, 380);
  };
  const stepper = (
    <span className="field-stepper">
      <input
        className="field-control numeric"
        type="number"
        step={step}
        min={min}
        placeholder={placeholder}
        value={value ?? ""}
        aria-label={inline ? `${label}${unit ? ` (${unit})` : ""}` : undefined}
        onChange={(e) => {
          acc.current = null;
          if (e.target.value === "") return onChange(null);
          const v = Number(e.target.value);
          if (Number.isFinite(v)) onChange(Math.max(min, v));
        }}
      />
      <span className="stepper-btns">
        <button type="button" tabIndex={-1} aria-label={`Increase ${label}`} title={`Hold to increase ${label}`} onMouseDown={beginHold(1)} onMouseUp={stop} onMouseLeave={stop} onClick={(e) => e.preventDefault()}>▲</button>
        <button type="button" tabIndex={-1} aria-label={`Decrease ${label}`} title={`Hold to decrease ${label}`} onMouseDown={beginHold(-1)} onMouseUp={stop} onMouseLeave={stop} onClick={(e) => e.preventDefault()}>▼</button>
      </span>
    </span>
  );
  if (inline) {
    return (
      <span className="field-stepper-inline" title={hint}>
        <span className="sr-only">{label}{unit ? ` (${unit})` : ""}</span>
        {stepper}
      </span>
    );
  }
  return (
    <label className={`field${overridden ? " field-overridden" : ""}`} title={hint}>
      <span className="field-label">
        {label}{unit ? ` (${unit})` : ""}
        {overridden && onReset && <button type="button" className="btn-link field-reset" onClick={(e) => { e.preventDefault(); onReset(); }}>Reset</button>}
      </span>
      {stepper}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}
