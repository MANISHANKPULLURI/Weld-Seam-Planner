import { seamColor } from "../../viewer/seamColors";
import { candidateVisible, inWorkArea, seamLengthMm, useStore } from "../../state/store";
import type { SeamSource } from "@weld/core";
import type { Seam } from "../../state/store";
import { CheckIcon, XIcon } from "../icons";
import { JOINT_HELP, JOINT_LABEL, MANUAL } from "../labels";

/**
 * render one candidate row with accept and reject
 */
function SeamRow({ seam }: { seam: Seam }) {
  const units = useStore((s) => s.frame.units);
  const selected = useStore((s) => s.selectedSeamId === seam.id);
  const selectSeam = useStore((s) => s.selectSeam);
  const setHoverSeam = useStore((s) => s.setHoverSeam);
  const acceptSeams = useStore((s) => s.acceptSeams);
  const rejectSeams = useStore((s) => s.rejectSeams);
  const candidate = seam.status === "candidate";

  return (
    <li className={`seam-row${selected ? " seam-row-selected" : ""}`} onMouseEnter={() => setHoverSeam(seam.id)} onMouseLeave={() => setHoverSeam(null)} onFocus={() => setHoverSeam(seam.id)} onBlur={() => setHoverSeam(null)}>
      <button type="button" className="seam-row-main" onClick={() => selectSeam(selected ? null : seam.id)} aria-pressed={selected} aria-label={`${candidate ? "Candidate" : "Seam"} ${candidate ? JOINT_LABEL[seam.jointType] : seam.name}, ${seamLengthMm(seam, units).toFixed(1)} millimetres, ${candidate ? seam.reason : ""}`}>
        <span className={`seam-swatch${candidate ? " seam-swatch-candidate" : ""}`} style={candidate ? undefined : { background: seamColor(seam) }} aria-hidden="true" />
        <span className="seam-row-name" title={JOINT_HELP[seam.jointType]}>{candidate ? JOINT_LABEL[seam.jointType] : seam.name}</span>
        <span className="seam-row-meta">{candidate ? seam.reason : MANUAL[seam.source] ?? JOINT_LABEL[seam.jointType]}</span>
        <span className="seam-row-length numeric">{seamLengthMm(seam, units).toFixed(1)} mm</span>
      </button>
      {candidate && (
        <span className="seam-row-actions">
          <button type="button" className="icon-btn icon-btn-ok" onClick={() => acceptSeams([seam.id])} aria-label={`Accept ${JOINT_LABEL[seam.jointType]} ${seamLengthMm(seam, units).toFixed(1)} millimetres, ${seam.reason}`} title="Accept (A)"><CheckIcon size={14} /></button>
          <button type="button" className="icon-btn" onClick={() => rejectSeams([seam.id])} aria-label={`Reject ${JOINT_LABEL[seam.jointType]} ${seamLengthMm(seam, units).toFixed(1)} millimetres, ${seam.reason}`} title="Reject"><XIcon size={14} /></button>
        </span>
      )}
    </li>
  );
}

const SOURCE_CHIP: Partial<Record<SeamSource, string>> = { inside_corner: "Inside corners", contact: "Plates touch", intersection: "Intersections", outside_corner: "Outside corners" };

/**
 * list candidates and kept seams with filters
 */
export function SeamList() {
  const everySeam = useStore((s) => s.seams);
  const workArea = useStore((s) => s.workArea);
  const seams = workArea ? everySeam.filter((s) => inWorkArea(s, workArea)) : everySeam;
  const units = useStore((s) => s.frame.units);
  const filter = useStore((s) => s.candidateFilter);
  const { acceptSeams, rejectSeams, setCandidateFilter } = useStore.getState();
  const allCandidates = seams.filter((s) => s.status === "candidate");
  const candidates = allCandidates.filter((s) => candidateVisible(s, filter, units)).sort((a, b) => b.confidence - a.confidence || b.length - a.length);
  const accepted = seams.filter((s) => s.status === "accepted");
  const sources = (Object.keys(SOURCE_CHIP) as SeamSource[]).map((source) => ({ source, count: allCandidates.filter((c) => c.source === source).length })).filter((x) => x.count > 0);

  /**
   * hide or show one candidate source
   */
  const toggle = (source: SeamSource) => setCandidateFilter({ hidden: filter.hidden.includes(source) ? filter.hidden.filter((x) => x !== source) : [...filter.hidden, source] });

  return (
    <>
      {allCandidates.length > 0 && (
        <section className="seam-section" aria-label="Candidates">
          <header className="seam-section-header">
            <span className="section-label">Candidates <span className="numeric">{candidates.length}{candidates.length !== allCandidates.length ? ` of ${allCandidates.length}` : ""}</span></span>
            <span className="seam-section-actions">
              <button type="button" className="btn-link" onClick={() => { if (candidates.length > 5 && !window.confirm(`Accept ${candidates.length} candidates? You can undo.`)) return; acceptSeams(candidates.map((c) => c.id)); }} disabled={candidates.length === 0} title="Accept every candidate shown (undoable)">Accept shown</button>
              <button type="button" className="btn-link" onClick={() => { if (candidates.length > 5 && !window.confirm(`Reject ${candidates.length} candidates? You can undo.`)) return; rejectSeams(candidates.map((c) => c.id)); }} disabled={candidates.length === 0} title="Reject every candidate shown (undoable)">Reject shown</button>
            </span>
          </header>
          <div className="seam-filter" role="group" aria-label="Filter candidates">
            {sources.map(({ source, count }) => (
              <button key={source} type="button" className="chip" aria-pressed={!filter.hidden.includes(source)} onClick={() => toggle(source)}>
                {SOURCE_CHIP[source]} <span className="numeric">{count}</span>
              </button>
            ))}
            <label className="seam-filter-length" title="Hide candidates shorter than this">
              Longer than
              <input className="field-control" type="number" min={0} step={5} value={filter.minLengthMm || ""} placeholder="0" onChange={(e) => setCandidateFilter({ minLengthMm: Math.max(0, Number(e.target.value) || 0) })} />
              mm
            </label>
          </div>
          {candidates.length > 0
            ? <ul className="seam-rows">{candidates.map((s) => <SeamRow key={s.id} seam={s} />)}</ul>
            : <p className="seam-empty">All candidates are filtered out.</p>}
        </section>
      )}

      <details className="disclosure seam-legend">
        <summary>What do these words mean?</summary>
        <dl>
          <div><dt>Fillet weld</dt><dd>{JOINT_HELP.fillet.split(": ")[1]}</dd></div>
          <div><dt>Butt / corner weld</dt><dd>Plates edge to edge, or meeting at an outside corner.</dd></div>
          <div><dt>Inside corner, 90°</dt><dd>Where it was found, and the angle between the two surfaces.</dd></div>
          <div><dt>Plates touch / Intersections</dt><dd>Two separate parts resting on, or passing through, each other.</dd></div>
          <div><dt>Dashed line</dt><dd>A suggestion. ✓ keeps it (solid line, own colour), ✕ drops it.</dd></div>
        </dl>
      </details>

      <section className="seam-section" aria-label="Seams">
        <header className="seam-section-header">
          <span className="section-label">Seams <span className="numeric">{accepted.length}</span></span>
          {workArea && <span className="seam-area-note" title="Seams outside the work area are kept, just hidden">in work area, {everySeam.filter((x) => x.status === "accepted").length - accepted.length} outside</span>}
        </header>
        {accepted.length === 0
          ? <p className="seam-empty">{workArea ? "No seams in this work area yet." : "No seams yet. Accept candidates, or add seams with Pick edge or Draw."}</p>
          : <ul className="seam-rows">{accepted.map((s) => <SeamRow key={s.id} seam={s} />)}</ul>}
      </section>
    </>
  );
}
