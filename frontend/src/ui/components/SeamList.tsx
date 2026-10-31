import { SEAM_DETECTION_AVAILABLE } from "../../domain/seams/flags";

export function SeamList() {
  return (
    <div className="seam-list">
      <div className="seam-list-empty">
        <div className="seam-list-empty-title">No seams yet</div>
        <div className="seam-list-empty-body">Detect candidate seams or draw one by hand.</div>
      </div>
      {SEAM_DETECTION_AVAILABLE ? (
        <button type="button" className="btn-secondary">Detect candidate seams</button>
      ) : (
        <div className="seam-list-note">Automatic detection arrives in the next phase.</div>
      )}
    </div>
  );
}
