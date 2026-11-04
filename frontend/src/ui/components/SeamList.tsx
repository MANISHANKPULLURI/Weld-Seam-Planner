import { seamLengthMm, useStore } from "../../state/store";
import type { Seam } from "../../state/store";
import { CheckIcon, XIcon } from "../icons";

const JOINT_LABEL: Record<Seam["jointType"], string> = { fillet: "Fillet", butt: "Butt", corner: "Corner", unknown: "Seam" };

function SeamRow({ seam }: { seam: Seam }) {
  const units = useStore((s) => s.frame.units);
  const selected = useStore((s) => s.selectedSeamId === seam.id);
  const selectSeam = useStore((s) => s.selectSeam);
  const acceptSeams = useStore((s) => s.acceptSeams);
  const rejectSeams = useStore((s) => s.rejectSeams);
  const candidate = seam.status === "candidate";

  return (
    <li className={`seam-row${selected ? " seam-row-selected" : ""}`}>
      <button type="button" className="seam-row-main" onClick={() => selectSeam(selected ? null : seam.id)} aria-pressed={selected}>
        <span className={`seam-swatch${candidate ? " seam-swatch-candidate" : ""}`} aria-hidden="true" />
        <span className="seam-row-name">{candidate ? JOINT_LABEL[seam.jointType] : seam.name}</span>
        <span className="seam-row-meta">{candidate ? seam.reason : JOINT_LABEL[seam.jointType]}</span>
        <span className="seam-row-length numeric">{seamLengthMm(seam, units).toFixed(1)} mm</span>
      </button>
      {candidate && (
        <span className="seam-row-actions">
          <button type="button" className="icon-btn icon-btn-ok" onClick={() => acceptSeams([seam.id])} aria-label="Accept seam" title="Accept"><CheckIcon size={12} /></button>
          <button type="button" className="icon-btn" onClick={() => rejectSeams([seam.id])} aria-label="Reject seam" title="Reject"><XIcon size={12} /></button>
        </span>
      )}
    </li>
  );
}

export function SeamList() {
  const seams = useStore((s) => s.seams);
  const acceptSeams = useStore((s) => s.acceptSeams);
  const rejectSeams = useStore((s) => s.rejectSeams);
  const candidates = seams.filter((s) => s.status === "candidate").sort((a, b) => b.confidence - a.confidence || b.length - a.length);
  const accepted = seams.filter((s) => s.status === "accepted");

  return (
    <>
      {candidates.length > 0 && (
        <section className="seam-section" aria-label="Candidates">
          <header className="seam-section-header">
            <span className="section-label">Candidates <span className="numeric">{candidates.length}</span></span>
            <span className="seam-section-actions">
              <button type="button" className="btn-link" onClick={() => acceptSeams(candidates.map((c) => c.id))}>Accept all</button>
              <button type="button" className="btn-link" onClick={() => rejectSeams(candidates.map((c) => c.id))}>Reject all</button>
            </span>
          </header>
          <ul className="seam-rows">{candidates.map((s) => <SeamRow key={s.id} seam={s} />)}</ul>
        </section>
      )}

      <section className="seam-section" aria-label="Seams">
        <header className="seam-section-header">
          <span className="section-label">Seams <span className="numeric">{accepted.length}</span></span>
        </header>
        {accepted.length === 0
          ? <p className="seam-empty">No seams yet. Accept candidates, or add seams with Edge chain or Draw.</p>
          : <ul className="seam-rows">{accepted.map((s) => <SeamRow key={s.id} seam={s} />)}</ul>}
      </section>
    </>
  );
}
