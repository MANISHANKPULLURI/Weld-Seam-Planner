import { useEffect, useRef, useState } from "react";

type Option<T extends string | number> = { value: T; label: string; hint?: string };

export function MenuSelect<T extends string | number>({ label, value, options, onChange, hint, className, openUp }: {
  label: string;
  value: T;
  options: Option<T>[];
  onChange: (v: T) => void;
  hint?: string;
  className?: string;
  openUp?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(() => Math.max(0, options.findIndex((o) => o.value === value)));
  const ref = useRef<HTMLDivElement>(null);
  const current = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open ]);

  useEffect(() => {
    if (open) setActive(Math.max(0, options.findIndex((o) => o.value === value)));
  }, [open, options, value]);

  const pick = (v: T) => { onChange(v); setOpen(false); };

  return (
    <div className={`menu-select${className ? ` ${className}` : ""}${openUp ? " menu-select-up" : ""}`} ref={ref} title={hint}>
      <span className="field-label" id={`ms-${label}`}>{label}</span>
      <button
        type="button"
        className="menu-select-btn field-control"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby={`ms-${label}`}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen(true); }
          else if (e.key === "Escape") setOpen(false);
        }}
      >
        <span>{current?.label ?? value}</span>
        <span className={`menu-select-chev${open ? " menu-select-chev-open" : ""}`} aria-hidden="true">▾</span>
      </button>
      {open && (
        <ul className="menu-select-list" role="listbox" aria-label={label}>
          {options.map((o, i) => (
            <li key={o.value} role="option" aria-selected={o.value === value}>
              <button
                type="button"
                className={`menu-select-item${i === active ? " menu-select-item-active" : ""}${o.value === value ? " menu-select-item-current" : ""}`}
                title={o.hint}
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(o.value)}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => (a + 1) % options.length); }
                  else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => (a - 1 + options.length) % options.length); }
                  else if (e.key === "Enter") { e.preventDefault(); pick(options[active]?.value ?? o.value); }
                  else if (e.key === "Escape") setOpen(false);
                }}
              >
                <span className="menu-select-check" aria-hidden="true">{o.value === value ? "✓" : ""}</span>
                <span>{o.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
