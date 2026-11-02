import { LockIcon } from "../icons";
import { useStore } from "../../state/store";

export function LocalOnlyChip() {

  const fileName = useStore((s) => s.fileName);

  if (fileName) {
    return (
      <span className="local-chip" title="File uploaded to server for validation and repair">
        <LockIcon size={12} />
        Uploaded for validation
      </span>
    );
  }

  return (
    <span className="local-chip" title="Files are uploaded to the server for validation">
      <LockIcon size={12} />
      Uploaded for validation
    </span>
  );
}
