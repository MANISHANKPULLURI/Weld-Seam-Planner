import { LockIcon } from "../icons";

export function LocalOnlyChip() {
  return (
    <span className="local-chip" title="Files stay in your browser">
      <LockIcon size={12} />
      Local only
    </span>
  );
}
