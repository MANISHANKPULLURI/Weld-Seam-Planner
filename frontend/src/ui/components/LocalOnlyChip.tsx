import { LockIcon } from "../icons";

export function LocalOnlyChip() {
  return (
    <span className="local-chip" title="Your STL is checked and repaired in this browser. It is never uploaded.">
      <LockIcon size={12} />
      Stays in your browser
    </span>
  );
}
