import { useEffect } from "react";
import { useStore } from "../../state/store";

export function ConfirmHost() {
  const confirm = useStore((s) => s.confirm);

  useEffect(() => {
    if (!confirm) return;
    const close = (e: KeyboardEvent) => { if (e.key === "Escape") useStore.getState().setConfirm(null); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [confirm !== null]);

  if (!confirm) return null;

  return (
    <div className="confirm-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) useStore.getState().setConfirm(null); }}>
      <section className="confirm-card result-card" role="alertdialog" aria-modal="true" aria-label={confirm.title}>
        <header className="result-header">
          <span className="result-title">{confirm.title}</span>
        </header>
        <p className="result-explainer">{confirm.message}</p>
        <div className="result-actions result-actions-split">
          <button type="button" className="btn-secondary" autoFocus onClick={() => useStore.getState().setConfirm(null)}>Cancel</button>
          <button
            type="button"
            className={confirm.danger ? "btn-primary confirm-danger" : "btn-primary"}
            onClick={() => { const c = useStore.getState().confirm; useStore.getState().setConfirm(null); c?.action(); }}
          >
            {confirm.confirmLabel ?? "Confirm"}
          </button>
        </div>
      </section>
    </div>
  );
}
