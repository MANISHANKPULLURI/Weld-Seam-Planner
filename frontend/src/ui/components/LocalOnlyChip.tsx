import { UploadIcon } from "../icons";

export function LocalOnlyChip() {
  return (
    <span className="local-chip" title="Your STL is sent to the planner server to be checked and repaired, then deleted.">
      <UploadIcon size={12} />
      Checked on server
    </span>
  );
}
