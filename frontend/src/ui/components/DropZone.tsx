import { useRef, useState } from "react";
import { UploadIcon, AlertIcon, LockIcon } from "../icons";
import { analyseFile } from "../../lib/meshClient";
import { createSampleStl } from "../../domain/mesh/sample";

const MAX_FILE_MB = 300;

/**
 * render the STL file drop zone
 */
export function DropZone() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * validate a chosen file and start analysing it
   */
  function load(file: File) {
    if (!file.name.toLowerCase().endsWith(".stl")) { setError("Choose an .stl file."); return; }
    if (file.size === 0) { setError("This file is empty."); return; }
    if (file.size > MAX_FILE_MB * 1024 * 1024) { setError(`This file is over ${MAX_FILE_MB} MB. Try a simplified export.`); return; }
    setError(null);
    analyseFile(file, file.name);
  }

  /**
   * analyse the file dropped onto the zone
   */
  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) load(f);
  }

  /**
   * analyse the file chosen in the file picker
   */
  function onBrowse(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) load(f);
    e.target.value = "";
  }

  return (
    <div className="dropzone-stack">
      <div
        className={`dropzone${dragOver ? " dropzone-drag" : ""}`}
        role="button"
        tabIndex={0}
        aria-label="Drop an STL here or browse for a file"
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); inputRef.current?.click(); } }}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
      >
        <UploadIcon size={28} />
        <div className="dropzone-title">Drop an STL here</div>
        <div className="dropzone-helper">Binary or ASCII, up to {MAX_FILE_MB} MB.</div>
        <div className="dropzone-actions" onClick={(e) => e.stopPropagation()}>
          <button type="button" className="btn-secondary" onClick={() => inputRef.current?.click()}>Browse files</button>
          <button type="button" className="btn-ghost" onClick={() => analyseFile(createSampleStl(), "sample-cube.stl")}>Load sample part</button>
        </div>
      </div>
      <p className="dropzone-privacy"><LockIcon size={12} /> Your file is checked in this browser and never uploaded.</p>
      <input ref={inputRef} type="file" accept=".stl" hidden onChange={onBrowse} />
      {error && (
        <div role="alert" className="dropzone-error">
          <AlertIcon size={14} /> {error}
        </div>
      )}
    </div>
  );
}
