import { useRef, useState } from "react";
import { UploadIcon, AlertIcon } from "../icons";
import { analyseFile, analyseFileFromFile } from "../../lib/meshClient";
import { createSampleStl } from "../../domain/mesh/sample";

export function DropZone() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function validateAndLoad(file: File) {
    if (!file.name.toLowerCase().endsWith(".stl")) { setError("Choose an .stl file."); return; }
    if (file.size > 500 * 1024 * 1024) { setError("That file is over 500 MB. Try a simplified export."); return; }
    if (file.size === 0) { setError("No triangles found. This doesn't look like an STL file."); return; }
    setError(null);
    if (file.size > 5 * 1024 * 1024) {
      analyseFileFromFile(file).catch(() => setError("This file doesn't look like a valid STL."));
    } else {
      file.arrayBuffer().then((buf) => analyseFile(buf, file.name)).catch(() => setError("This file doesn't look like a valid STL."));
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) validateAndLoad(f);
  }

  function onBrowse(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) validateAndLoad(f);
    e.target.value = "";
  }

  function loadSample() {
    const buf = createSampleStl();
    analyseFile(buf, "sample.stl");
  }

  return (
    <div>
      <div
        className={`dropzone${dragOver ? " dropzone-drag" : ""}`}
        role="button"
        tabIndex={0}
        aria-label="Drop an STL here"
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); inputRef.current?.click(); } }}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
      >
        <UploadIcon size={28} />
        <div className="dropzone-title">Drop an STL here</div>
        <div className="dropzone-helper">Binary or ASCII STL, up to 500 MB. Uploaded in 5 MB chunks with progress.</div>
        <div className="dropzone-actions" onClick={(e) => e.stopPropagation()}>
          <button type="button" className="btn-secondary" onClick={() => inputRef.current?.click()}>Browse files</button>
          <button type="button" className="btn-ghost" onClick={loadSample}>Load sample part</button>
        </div>
      </div>
      <input ref={inputRef} type="file" accept=".stl" hidden onChange={onBrowse} />
      {error && (
        <div role="alert" className="dropzone-error">
          <AlertIcon size={14} /> {error}
        </div>
      )}
    </div>
  );
}
