import { LockIcon } from "../icons";

/**
 * render the stays-in-your-browser badge
 */
export function LocalOnlyChip() {
  return (
    <span className="local-chip" title="Your STL is checked and repaired in this browser. It is never uploaded.">
      <LockIcon size={12} />
      <span className="local-chip-text">Stays in your browser</span>
    </span>
  );
}
