# Armatrix Weld Seam Planner

Upload an STL, pick the weld seams, set weld parameters per seam, order them, and export a robot-ready JSON weld job. All mesh processing runs in your browser; the part never leaves your machine.

## 1. The problem we started from

Programming a robotic weld cell starts with a CAD part and ends with a controller that needs exact numbers: where each seam lies on the part, which direction to weld it, how the torch must tilt at every point along it, and the electrical recipe behind each pass. In practice that plan is built by hand: an engineer eyeballs edges in a CAD viewer, types waypoints into a spreadsheet or teach pendant, and hopes the torch angles, heat input and weld positions are consistent. Every hand-copied number is a chance to scrap a part or, worse, to weld with the wrong heat input and only find out at inspection.

The planner exists to close that gap end to end: from an untrusted STL file to a sealed, validated, deterministic JSON job a robot controller can consume without re-interpretation.

## 2. How we solved it

The product is a five-step guided workflow that mirrors how a welding engineer actually works:

1. **Part** — drop in an STL. It is parsed, welded, oriented and health-checked (open edges, flipped faces, non-manifold edges, separate bodies), with optional repair. Units and the up axis are guessed, shown as guesses, and must be confirmed before anything else unlocks.
2. **Seams** — automatic detection proposes inside corners, touching plates and intersecting bodies as candidates. You accept them one by one (framed camera, K to keep, D to drop) or in bulk, and you can always add missed seams by picking an edge chain or drawing on the surface. Then rename, reverse, split, merge or delete.
3. **Procedures** — a reusable procedure library (EXAMPLE MAG 135, MIG 131, FCAW 136, TIG 141, plus your own custom cards with base metal and thickness). Apply a procedure to many seams at once, then override anything per seam: weld size, passes, stitches, current, voltage, speed, torch angles, approach and retract.
4. **Sequence** — order the seams by drag or by auto-order (nearest air travel with direction flips), set direction and cooling waits per seam, and preview the whole job with a torch that plays the weld at real speed.
5. **Review** — validation gates the export (errors block, warnings do not, every issue jumps to its seam), then download or copy the sealed JSON, or import a job back onto the same part later.

Everything downstream is computed, never typed: heat input, arc time, weld position, torch frames per waypoint, air travel and cycle time. The export is canonical JSON with a SHA-256 integrity hash, so re-exporting an unchanged plan yields a byte-identical file.

## 3. How a part becomes a plan, in plain words

No algorithm names below on purpose. This is what actually happens to your STL, step by step, in the order it happens.

**Collect the triangles.** An STL file is just a long list of triangles, in binary or in text form. We read every single one, throw away the stored normals (they are often wrong), and drop triangles with zero area or exact duplicates.

**Glue the corners together.** A real part has shared corners, but a file stores each triangle's corners separately. So we snap together every corner that lands on essentially the same spot (within a tiny tolerance scaled to the part size). After this, edges shared by two triangles become visible, and that shared-edge map is the foundation for everything else.

**Trace the shells.** Walk from edge to edge: in a clean solid, every edge is shared by exactly two triangles, so following them traces out closed shells. Separate bodies trace out as separate shells, which is normal for weldments shipped as assemblies. An edge with only one triangle is a hole (an open edge). An edge shared by three or more triangles means plates are touching there, which is itself a weld hint. This walk also tells closed shells apart from open patches.

**Turn every face outward.** For a closed shell, start on one face and flood across it, flipping neighbours as you go so all faces point outward; the enclosed volume check confirms the direction. For open patches, cast rays from the surface and let the hits vote on which way is out. Now the part has a consistent inside and outside.

**Find the bends.** For every shared edge, measure how sharply its two faces bend. A sharp inward bend roughly between 45 and 120 degrees is a fillet candidate. Two impostors are rejected: rounded edges (which show up as many tiny parallel bends close together) and machined cylinders or bores (evenly spaced bends ringing a hole). Edges that survived the open-edge walk as touching plates, and places where one body passes through another, become contact and intersection candidates.

**Link pieces into seams.** Short matching pieces that meet end to end are chained into longer seams, breaking the chain at sharp corners; stubs shorter than a fraction of the part size are dropped. Each seam gets a stable ID built from its rounded endpoints and length, so re-running detection keeps your keep, drop, rename and parameter edits on every seam that did not change.

**Fix the units once.** The file never states its units, so we assume millimetres and sanity-check the size (a two-millimetre car is probably metres; a 20-metre bracket is probably millimetres times a thousand). You confirm, and from then on every number downstream is millimetres, Z up, gravity down.

**Do the weld maths.** Arc energy comes from volts times amps divided by travel speed; heat input is a fixed efficiency fraction of that (0.8 for MIG/MAG and flux-cored, 0.6 for TIG). Arc time is welded length over speed times passes. Throat and leg convert through the opening angle. Weld position (flat, horizontal, vertical up or down and so on, in ISO and AWS codes) comes from the seam's slope and how its faces rotate against gravity, and is recomputed whenever you reverse a seam.

**Aim the torch.** At each point the torch looks straight down the corner bisector into the weld, then tilts by your work-angle and travel-angle offsets. The frame is resampled about every 5 mm including both endpoints, and each waypoint stores the point, the tangent, the two face normals, the torch axis, the contact-tip position and the full tool orientation with continuous sign, so a controller never sees a flipped pose mid-seam.

**Order the work.** Visit the closest unvisited seam next, then untangle crossings with a few passes, flipping a seam's direction when that shortens the trip. Seams are grouped by compartment first (hopping between compartments costs more than straight-line distance suggests), and the plan warns if one side of the part would soak up far more heat than the other.

## 4. Run it locally

Requires [Bun](https://bun.sh) 1.3 or newer. No other toolchain is needed.

```bash
bun install          # install all workspaces (root, core, backend, frontend)
bun run dev          # frontend on http://localhost:5173, API on http://localhost:8000
bun run test         # core, frontend and backend test suites
bun run check        # TypeScript typecheck across all workspaces
bun run build        # production frontend build (served by the backend)
```

Run everything with Docker (single image, see section 4):

```bash
docker build -t weld-planner .
docker run -p 8000:8000 -e MAX_FILE_MB=500 weld-planner
# app on http://localhost:8000, health at http://localhost:8000/api/v1/health
```

Or deploy as-is with `fly deploy` (configuration lives in `fly.toml`).

Environment variables (all optional unless noted):

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `8000` | Port the Bun server listens on |
| `MAX_FILE_MB` | `500` | Largest accepted STL upload |
| `UPLOAD_DIR` | OS tmp `weld-uploads` | Chunked-upload scratch directory |
| `UPLOAD_TTL_MIN` | `30` | How long incomplete uploads are kept |
| `STATIC_DIR` | `backend/src/../../frontend/dist` | Where the built SPA is served from |
| `CORS_ORIGIN` | empty (same-origin only) | Allowed browser origins for `/api/*` |
| `VITE_API_URL` | `http://localhost:8000` | API origin baked into the dev client (see `frontend/.env.example`; never put secrets in `VITE_*` variables) |

## 5. Architecture and key design decisions

```
Weld-Seam-Planner/
  packages/core   @weld/core: STL parsing, mesh pipeline, seam detection and
                  editing, weld maths, sequencing, job compiler and the Zod
                  schema. Pure TypeScript, no React, no Three.js, no Hono.
  frontend        React + Vite + Three.js + Zustand. Mesh work runs in a Web
                  Worker; SceneController owns the 3D viewport; the store owns
                  UI state. Fully offline-capable once loaded.
  backend         Bun + Hono. Two jobs: serve the built SPA (with SPA fallback
                  and a traversal guard), and expose the same core pipeline as
                  an HTTP API for automation and headless use.
  backend/schema/weld-job.schema.json
                  Generated file. Never hand-edited.
```

### Decision 1: one shared core, used by both ends

`@weld/core` holds parsing, topology, detection, weld maths, sequencing, the job compiler and the Zod schemas, with zero UI or server imports. The frontend runs it in a Web Worker so a million-triangle part never freezes the panels; the backend imports the very same functions for its API. One implementation means the numbers in the browser and the numbers on the server cannot drift apart, and the geometry suite (8 known weldments, rotated: 100% recall, under 0.01 mm error) guards both.

### Decision 2: the Zod schema is the single source of truth

Every exported field carries a `.describe()` string in `packages/core/src/schema/`. The published JSON Schema (`backend/schema/weld-job.schema.json`, via `bun run generate:schema`) and the frontend TypeScript types are generated from those descriptions, never written by hand. Documenting a field in exactly one place keeps the README table below, the API schema and the code in agreement by construction.

### Decision 3: local-first, guess-nothing-silently

STL files carry no units and no material, so the app *must* guess — but a guess that pretends to be fact corrupts every downstream number. The rules are explicit and documented in `docs/DECISIONS.md`: assume millimetres; a largest dimension under 2 suggests metres; 2 to 60 (or `inch` in the name) raises a non-blocking inch hint; over 20 000 warns. Every guess is badged as a guess until you confirm it, and confirmation gates steps 2 to 5. The part genuinely never leaves the machine: parsing, welding, detection and repair all run in the browser worker.

### Decision 4: stable seam identities

Detected seams get IDs from a hash of kind plus rounded endpoints, length and midpoint (loops use centroid plus mean normal). Re-running detection with new thresholds keeps the IDs — and therefore your accept, reject, rename and parameter edits — for every seam that did not change. Splits and merges mint new IDs; the undo toast names exactly what changed.

### Decision 5: deterministic, sealed export

Export serializes with sorted keys, lengths rounded to 3 decimals, unit vectors and quaternions to 6 decimals, timestamps in UTC, then `integrity.content_sha256` is the SHA-256 of that canonical form with the integrity block itself removed. Same plan in means byte-identical file out, which is what makes the hash a real tamper seal and makes re-import matching by hash trustworthy.

### Decision 6: pragmatic undo and persistence

Undo is a single-level snapshot of the plan slice (seams, sequence, waits, rejected IDs, selection) with a toast that names the action and offers one-click revert; bulk accepts and rejects are undoable too. Work autosaves to IndexedDB on a debounce, and up to 5 named projects live side by side in the top-bar switcher, each in its own slot, so switching projects can never mix two parts' plans. A full project file (`.weldjob.json`) round-trips through Review: export it, and importing it onto the same STL (matched by SHA-256) restores seams, procedures, order and settings.

### Decision 7: one container, one process

The Docker image is a single self-contained unit: the build stage compiles the SPA, the runtime stage (`oven/bun:slim`, production dependencies only) copies the backend, the shared package and the built SPA, and one Bun process serves both. There is no separate frontend image and no compose stack, because the UI and the API it calls would only gain network hops. See `Dockerfile` and `.dockerignore`.

## 6. Features built (what you can do)

**Part step**
- Drop an STL (binary or ASCII, chunked upload for large files) or reload the autosaved session; guided flow with progress per stage (read, weld, topology, measure).
- Health card: triangles, bodies, open edges, non-manifold edges, degenerate triangles, size in confirmed units, in plain language (multi-body assemblies are normal for weldments, not framed as errors).
- One-click repair (fill holes, fix flipped faces) with before/after counts and undo; download the repaired STL.
- Units (mm, cm, m, inch) and up-axis (+Z, +Y, pick-a-face) with guess badges; confirming records `scale_to_mm` and the part-to-job transform used by the export.

**Seams step**
- **Detect seams** with tunable feature angle (default 30°), minimum length (default 1% of diagonal), contact tolerance and optional outside corners; candidates render dashed, accepted solid, selected orange.
- **Review one by one**: the camera frames each suggestion; press K (keep), D (drop), arrows to move, Esc to exit; bulk Accept/Reject shown with confirm and full undo.
- Manual tools that always work even when detection finds nothing: **Pick edge** (hover highlights the tangent-continuous chain) and **Draw** (click points on the surface, snapping to seam ends, corners and edges; Enter finishes, Backspace removes a point).
- Edits: rename, reverse direction, split at a clicked point or into equal parts (live preview), merge touching seams, delete; duplicate seams are caught automatically.
- **Section plane** (X/Y/Z with slider, Flip) plus **Work here only** confines detection, the list, picking and drawing to the kept side; **X-ray** shows internal seams; body list with show/hide/isolate; focus mode ghosts everything else.
- One-by-one candidate cards and the seam ops card float beside the panel at the click point, remount with an animation on each new pick, collapse, and auto-close on selection or step change.

**Procedures step**
- Library of EXAMPLE procedures (MAG 135 steel, MIG 131 aluminium, FCAW 136 steel, TIG 141 stainless — starting points, never recommendations), each with process (ISO 4063), **base metal and thickness**, current, voltage, travel speed, wire feed and diameter, gas and flow, thermal efficiency `k`, heat/travel limits, and seam defaults.
- **New custom** opens a floating editor (grouped dropdowns: electrical, wire and gas, limits, seam defaults); Apply adds it to the library. Copy and Edit any card in the same floating editor with Collapse.
- Bulk assign to ticked seams (with an “apply to the ones without one” shortcut); per-seam overrides for current, voltage, travel speed and wire feed with one-click reset to the procedure value.
- Live derived values per seam: heat input (kJ/mm), arc time, throat/leg conversion, weld position (ISO 6947 + AWS, derived badge or your override), plus plain-language warnings (fill-rate shortfall, multipass suggestion, spray-out-of-position, FCAW push angle and more).

**Sequence step**
- Drag-to-reorder list (also keyboard movable), per-seam direction flip (⇄), cooling waits, air speed, and **Auto order** (always visits the closest seam next, then untangles crossings, flipping directions to cut air travel, reporting millimetres saved).
- The part shows sequence numbers, direction arrows and dashed air moves; totals for arc time, air travel/time, waits and cycle time.
- **▶ Play weld** runs a torch glyph along every seam in execution order at real travel speed (1×/5×/10×/30× scrubber with progress readout).

**Review step**
- Job name, notes, draft/approved status, supervision mode, waypoint spacing with animated steppers.
- Validation list where errors block export and each issue jumps to its seam; collapsible JSON preview; Download, Copy, and re-import of `.weldjob.json` (SHA-matched to the loaded part, with a guided restore banner when the part differs).

**Across the whole app**
- Five-step number-line stepper with keyboard shortcuts (`1`–`5`, `F`, `R`, `W`, `X`, `E`/`D`, `A`, `V`, `?` overlay); single-level undo with named toast plus redo; dark and light studio themes with an animated View-Transition theme toggle; collapsible panel; animated confirmations instead of native dialogs; per-step “How this step works” guides.

## 7. Export format reference (`.weldjob.json`, schema 1.0.0)

Conventions for the whole document: every length is millimetres (fields are named `*_mm`), the job frame is right-handed with Z up and gravity `[0, 0, -1]`, timestamps are ISO-8601 UTC, angles are degrees, and `seams[]` is in execution order (`sequence` equals the 1-based position). The machine-readable contract is `backend/schema/weld-job.schema.json` (generated, never hand-edited); the table below explains each field in plain language with its type.

### 7.1 Top-level document

| Field | Type | Meaning |
|---|---|---|
| `schema_version` | `string`, always `"1.0.0"` | Version of this format. Readers should reject unknown major versions. |
| `job` | `object` | Human metadata plus execution settings (section 6.2). |
| `frame` | `object` | The single coordinate frame everything is expressed in (section 6.3). |
| `part` | `object` | Which part this plan was built on, fingerprinted (section 6.4). |
| `procedures` | `object[]` | The procedure library entries actually referenced by seams (section 6.5). |
| `access` | `object` | Entry ports and arm reach. Reserved for Armatrix reach planning; currently ports are user-placed and reach is an estimate, not kinematics. |
| `seams` | `object[]` | The welds, in execution order (section 6.6). |
| `totals` | `object` | Summed lengths and times for quoting and cycle planning (section 6.9). |
| `validation` | `object` | Errors (block export) and warnings, each with a JSON path, a code and a message (section 6.10). |
| `integrity` | `object` | Tamper seal (section 6.11). |

### 7.2 `job` — metadata and execution settings

| Field | Type | Meaning |
|---|---|---|
| `job.id` | `string` | Unique job identifier, `job_YYYYMMDD_HHMM_xx`. Generated once per job and kept across re-exports so the hash stays stable. |
| `job.name` | `string` | Human name, e.g. `Stiffened panel rev B`. Used for the download filename and the project switcher label. |
| `job.created_at` | `string` date-time | ISO-8601 UTC creation timestamp. Kept stable across re-exports for the same reason as `id`. |
| `job.tool.name` | `string`, always `"armatrix-weld-planner"` | Which tool produced the file. Lets future importers branch on producer. |
| `job.tool.version` | `string` | Tool version at export time, for debugging format drift. |
| `job.status` | `"draft"` or `"approved"` | `draft` means arc off (safe to dry-run); `approved` means arc on. A workflow gate, not physics. |
| `job.notes` | `string` | Free text: revision notes, WPS references, anything the next engineer needs. |
| `job.execution.arc_enabled` | `boolean` | Master arc switch the cell should honour. Mirrors `status` in machine terms. |
| `job.execution.default_supervision` | `"operator_confirm"` or `"auto"` | Whether the cell waits for a human before each seam or runs the job alone. |
| `job.execution.air_speed_mm_s` | `number`, greater than 0 | Torch travel speed between seams. Drives air-time totals and the player preview. |
| `job.execution.waypoint_spacing_mm` | `number`, greater than 0 | Distance between exported poses along each seam. Smaller means smoother motion but many more points. |

### 7.3 `frame` — the one coordinate frame

| Field | Type | Meaning |
|---|---|---|
| `frame.units` | `string`, always `"mm"` | Declares that every `*_mm` field is millimetres. No inch/centimetre ambiguity, ever. |
| `frame.handedness` | `string`, always `"right"` | Right-handed coordinate system. A controller that needs left-handed data must convert explicitly. |
| `frame.up_axis` | `"+z"` or `"+y"` | Which axis points up in the job frame. |
| `frame.gravity` | `[number, number, number]` | Gravity vector, normally `[0, 0, -1]`. Weld position classification is computed against it. |
| `frame.part_to_job.scale_to_mm` | `number`, greater than 0 | Multiply raw STL coordinates by this to get millimetres (mm 1, cm 10, m 1000, inch 25.4). This is the confirmed file-units choice. |
| `frame.part_to_job.translation_mm` | `[number, number, number]` | Translation from part frame to job frame, in millimetres. |
| `frame.part_to_job.rotation_quaternion_xyzw` | `[number, number, number, number]` | Rotation from part frame to job frame as `[x, y, z, w]`. Order is fixed and named, so there is no xyzw-versus-wxyz guessing. |
| Job transform rule | formula | Every job-frame point equals `rotation · (scale_to_mm · part_point) + translation_mm`. |

### 7.4 `part` — which part this plan belongs to

| Field | Type | Meaning |
|---|---|---|
| `part.filename` | `string` | Original STL file name, for humans and for the re-import prompt. |
| `part.sha256` | `string` of 64 hex chars, or null | SHA-256 of the original file bytes (null only if the browser could not hash). Re-import requires a match, so a plan can never silently attach to the wrong part. |
| `part.triangle_count` | `integer`, 0 or more | Triangle count of the original file, a quick sanity check against the file on disk. |
| `part.bbox_mm.min` / `.max` | `[number, number, number]` each | Bounding-box corners in job-frame millimetres. Lets a cell verify scale and placement before moving. |
| `part.repaired` | `boolean` | Whether the mesh repair step was applied. Traceability for *why* the mesh differs from the file. |

### 7.5 `procedures[]` — the weld recipes actually used

Only procedures referenced by at least one seam are exported.

| Field | Type | Meaning |
|---|---|---|
| `procedures[].id` | `string` | Stable identifier (`proc_…`). Seams point at it via `procedure_ref`. |
| `procedures[].name` | `string` | Human name. Names starting with `EXAMPLE` are starting points, never recommendations: always substitute your WPS values. |
| `procedures[].process.kind` | `"gmaw"`, `"fcaw"` or `"gtaw"` | Gas metal arc, flux cored, or gas tungsten arc welding. |
| `procedures[].process.iso_4063` | `135`, `131`, `136` or `141` | ISO 4063 process number: MAG 135, MIG 131, FCAW 136, TIG 141. The app suggests the conventional metal per process (MAG/FCAW steel, MIG aluminium, TIG stainless) but never locks it. |
| `procedures[].material.metal` | `"steel"`, `"stainless"`, `"aluminium"` or `"other"`; optional | Base metal the procedure is tuned for. Optional for backward compatibility: older files simply omit it. |
| `procedures[].material.thickness_mm` | `number` greater than 0, or null; optional | Plate thickness the procedure is tuned for. Null means any thickness. |
| `procedures[].wire.diameter_mm` | `number` greater than 0 | Wire (or tungsten) diameter in millimetres. |
| `procedures[].gas.name` | `string` | Gas mix name, e.g. `Ar + 18% CO2`. Free text, exactly as your WPS states it. |
| `procedures[].gas.flow_l_min` | `number`, 0 or more, or null | Shielding gas flow in litres per minute. Null when not applicable. |
| `procedures[].electrical.voltage_v` | `number` greater than 0 | Arc voltage in volts. |
| `procedures[].electrical.current_a` | `number` greater than 0 | Welding current in amps. Together with voltage and speed this determines arc energy. |
| `procedures[].electrical.wire_feed_speed_m_min` | `number` greater than 0, or null | Wire feed speed in metres per minute. Null for TIG, which feeds no wire. |
| `procedures[].motion.travel_speed_mm_min` | `number` greater than 0 | Torch travel speed in millimetres per minute while the arc is on. |
| `procedures[].thermal_efficiency_k` | `number`, 0 to 1 | Share of arc energy that heats the part: 0.8 for GMAW/FCAW, 0.6 for GTAW. Editable. |
| `procedures[].limits.heat_input_kj_mm.min` / `.max` | `number` or null | Your WPS heat-input window. Values outside it raise warnings, never silent acceptance. |
| `procedures[].limits.travel_speed_mm_min` | `{min, max}` numbers or null, whole block nullable | Allowed travel-speed window. Null means no check. |
| `procedures[].limits.max_throat_per_pass_mm` | `number` greater than 0, or null | Largest throat one pass may lay. Bigger welds trigger a multipass suggestion. |
| `procedures[].seam_defaults` | `object` | What new seams start with: weld size basis and value, travel angle, stick-out. |

### 7.6 `seams[]` — the welds, in execution order

`sequence` is 1-based and always equals the array position. Every seam carries identity, joint, position, electricals, torch pose plan, geometry, derived maths and clearance state.

| Field | Type | Meaning |
|---|---|---|
| `seams[].id` | `string` | Stable identifier derived from a hash of kind plus rounded endpoints (or centroid for loops). Survives re-detection, reversal and rotation; splits and merges mint new IDs. |
| `seams[].name` | `string` | Display name (`S1`, `S2`, …), renamable. Cosmetic only; robots use `id` and `sequence`. |
| `seams[].sequence` | `integer`, 1-based | Execution order. Equals array position by construction. |
| `seams[].operation` | `string`, always `"weld"` | Reserved for future operations (kept extensible on purpose). |
| `seams[].joint.type` | `"fillet"`, `"butt"`, `"corner"` or `"unknown"` | Joint geometry. Auto-guessed from the dihedral angle (flat suggests butt, 90° concave suggests fillet or T, 90° convex suggests corner). |
| `seams[].joint.dihedral_deg` | `number`, 0 to 180 | Opening angle between the two faces in degrees. |
| `seams[].joint.concavity` | `"concave"` or `"convex"` | Whether the corner folds inward (fillet-like) or outward (corner-like). |
| `seams[].joint.type_source` | `"detected"` or `"user"` | Provenance of the joint type, so overrides are traceable. |
| `seams[].weld_position.iso_6947` | `PA`, `PB`, `PC`, `PD`, `PE`, `PF`, `PG` or `"inclined"` | ISO 6947 welding position derived from travel slope and face rotation against gravity (thresholds are configurable; see `docs/DECISIONS.md`), or your override. |
| `seams[].weld_position.aws` | `1G`, `1F`, `2G`, `2F`, `3G`, `3F`, `4G`, `4F` or `"inclined"` | The AWS/ASME equivalent of the ISO code. |
| `seams[].weld_position.source` | `"derived"` or `"user"` | Whether the position was computed or hand-set. |
| `seams[].direction` | `"forward"` or `"backward"` | Which end welding starts from. Flipping it swaps start and end, recomputes slope-dependent positions (PF versus PG) and mirrors the torch frames. |
| `seams[].procedure_ref` | `string` | The `procedures[].id` this seam follows. Must exist in the same file. |
| `seams[].overrides` | `object`, any subset of voltage, current, wire feed, travel speed | Per-seam values that differ from the procedure. Each is optional; absent means “use the procedure value”. |
| `seams[].effective` | `object` with `voltage_v`, `current_a`, `wire_feed_speed_m_min` (or null), `travel_speed_mm_min` | The resolved numbers the robot should actually use: procedure merged with overrides. A controller never has to implement merge logic. |
| `seams[].torch.work_angle_offset_deg` | `number` | Sideways tilt from the corner bisector in degrees. 0 points straight into the corner. |
| `seams[].torch.travel_angle_deg` | `number` | Lean along the seam in degrees. Positive means pushing the torch, negative means dragging. |
| `seams[].torch.travel_angle_convention` | `string`, always `"positive_push"` | Pins down the sign convention so no integrator has to guess. |
| `seams[].torch.stick_out_mm` | `number`, 0 or more | Contact-tip-to-work distance in millimetres. |
| `seams[].start.approach_mm` | `number`, 0 or more | Distance the torch travels in before the arc starts. |
| `seams[].start.run_in_mm` | `number`, 0 or more | Run-in distance at weld start. |
| `seams[].end.retract_mm` | `number`, 0 or more | Distance the torch backs away after the arc stops. |
| `seams[].end.crater_fill` | `boolean` | Whether to dwell and fill the end crater. |
| `seams[].weld_size.basis` | `"a"` or `"z"` | Which value you entered: `a` throat thickness (ISO 2553) or `z` leg length. The basis is stored explicitly so the other value is always derivable. |
| `seams[].weld_size.value_mm` | `number` greater than 0 | The entered size in millimetres. |
| `seams[].weld_size.passes` | `integer`, 1 or more | Number of passes. Above one single-pass throat, the app suggests multipass. |
| `seams[].intermittent` | `object` or null | Stitch welding: `weld_length_mm` per stitch and `pitch_mm` from one stitch start to the next. Null means a continuous weld. |
| `seams[].wait_after_s` | `number`, 0 or more | Cooling pause after this seam (interpass time), in seconds. |
| `seams[].supervision` | `"operator_confirm"` or `"auto"` | Per-seam supervision; defaults from the job execution settings. |
| `seams[].inspection` | `"visual"`, `"ndt"` or null | Inspection requirement for this seam, if any. |

### 7.7 `seams[].geometry` — the path the robot follows

| Field | Type | Meaning |
|---|---|---|
| `geometry.length_mm` | `number`, 0 or more | Total seam length in millimetres. |
| `geometry.frame_source` | `"two_surfaces"` or `"single_surface"` | Whether the torch orientation was derived from two real faces (reliable work angle) or a single surface (e.g. a hand-drawn seam: the UI warns you to review the work angle). |
| `geometry.waypoints[]` | `object[]` | Poses along the seam at fixed spacing (default 5 mm), always including both endpoints. |
| `waypoints[].s_mm` | `number`, 0 or more | Arc-length position along the seam in millimetres. Monotonic within a seam. |
| `waypoints[].position_mm` | `[number, number, number]` | Weld point in job-frame millimetres. |
| `waypoints[].tangent` | `[number, number, number]` | Unit tangent vector in the travel direction. |
| `waypoints[].surface_normals` | pair of `[number, number, number]` | The two outward face normals used for the frame (duplicated when only one surface exists). |
| `waypoints[].torch_axis` | `[number, number, number]` | Unit torch axis pointing from the torch into the weld: the negated corner bisector, tilted by work-angle and travel-angle offsets. |
| `waypoints[].contact_tip_mm` | `[number, number, number]` | Contact-tip position: weld point pulled back along the torch axis by the stick-out. |
| `waypoints[].tool_quaternion_xyzw` | `[number, number, number, number]` | Full tool orientation as `[x, y, z, w]`: Z is the torch axis toward the work, X is the travel direction orthogonalised, Y completes the frame. Sign-continuous between waypoints; named components remove xyzw-versus-wxyz ambiguity. |

### 7.8 `seams[].derived`, `access` and `checks`

| Field | Type | Meaning |
|---|---|---|
| `derived.arc_energy_kj_mm` | `number`, 0 or more | Arc energy `U·I·60 / (1000·v)` in kJ/mm. Pulsed or synergic modes are flagged approximate. |
| `derived.heat_input_kj_mm` | `number`, 0 or more | Heat input `k · arc energy` in kJ/mm (EN 1011-1 convention). Compared against the procedure limits to raise warnings. |
| `derived.arc_time_s` | `number`, 0 or more | Arc-on time: welded length over travel speed, times passes (stitch-adjusted for intermittent welds). |
| `access.status` | `"ok"`, `"blocked"` or `"not_checked"` | Torch clearance result. Currently `not_checked`: clearance checks are a planned feature, and air moves are straight lines. |
| `access.method` | `"distance"`, `"voxel"` or null | Which clearance method produced the status, if any. |
| `checks.torch_clearance` | `"ok"`, `"blocked"` or `"not_checked"` | Same clearance verdict, kept alongside the per-issue list so validators find it in one place. |

### 7.9 `totals` — the whole job at a glance

| Field | Type | Meaning |
|---|---|---|
| `totals.seam_count` | `integer`, 0 or more | Number of accepted seams in the job. |
| `totals.total_length_mm` | `number`, 0 or more | Summed welded length in millimetres. |
| `totals.arc_time_s` | `number`, 0 or more | Summed arc time in seconds. The basis of heat and wire estimates. |
| `totals.air_travel_mm` | `number`, 0 or more | Straight-line torch travel between seams, including approach and retract moves. |
| `totals.air_time_s` | `number`, 0 or more | Air travel time at the job's air speed. |
| `totals.wait_time_s` | `number`, 0 or more | Summed cooling waits between seams. |
| `totals.estimated_cycle_time_s` | `number`, 0 or more | Arc plus air plus waits: the number to quote against. |

### 7.10 `validation` — what blocks export and what merely warns

| Field | Type | Meaning |
|---|---|---|
| `validation.errors[]` | `object[]` | Blocking issues. The UI refuses export until the list is empty. |
| `validation.warnings[]` | `object[]` | Non-blocking issues, still exported so the robot cell sees them. |
| `*.path` | `string` | JSON path to the issue, e.g. `seams[3].procedure_ref`. The UI maps it back to the seam or setting. |
| `*.code` | `string` | Machine-readable code such as `seam.no_procedure` or `seam.heat_input_above_max`. |
| `*.severity` | `"error"` or `"warning"` | Fixed per list; kept explicit so validators do not infer it. |
| `*.message` | `string` | Plain-language explanation with the concrete next step. |

### 7.11 `integrity` — the tamper seal

| Field | Type | Meaning |
|---|---|---|
| `integrity.content_sha256` | `string`, 64 lowercase hex chars | SHA-256 of the canonical JSON (sorted keys, fixed rounding, UTC timestamps) computed with this field removed. Re-exporting an unchanged plan reproduces the identical hash; any edit, however small, changes it. Validators should recompute and compare before welding. |

### 7.12 Reading a real file

Below is a shortened real export (one procedure, waypoints trimmed), drawn the way the Review step shows it: ▸ marks a section you can open, and every line under it is one parameter with its actual value. Match each line against the tables above to see what the robot will do with it.

```
▸ job:                                   the human wrapper around the plan
  id:               "job_20261104_1858_f2"
  name:             "NiryoOneAssemblyCustom"
  created_at:       "2026-11-04T18:58:27.868Z"
  ▸ tool:           who produced this file
    name:             "armatrix-weld-planner"
    version:          "0.1.0"
  status:           "draft"                      arc off, safe to dry-run
  notes:            ""
  ▸ execution:      how the cell should run it
    arc_enabled:      false
    default_supervision: "operator_confirm"
    air_speed_mm_s:   150
    waypoint_spacing_mm: 5
▸ frame:                                 the one coordinate frame
  units:            "mm"
  handedness:       "right"
  up_axis:          "+z"
  gravity:          [0, 0, -1]
  ▸ part_to_job:    raw STL coordinates become job coordinates here
    scale_to_mm:    1                          file was already in mm
    translation_mm: [0, 0, 0]
    rotation_quaternion_xyzw: [0, 0, 0, 1]    no rotation needed
▸ part:                                  which part this plan belongs to
  filename:         "NiryoOneAssemblyCustom.stl"
  sha256:           "d3322507…"                full 64-char hash in the file
  triangle_count:   139150
  ▸ bbox_mm:        bounding box in mm
    min:            [⋯]
    max:            [⋯]
  repaired:         false
▸ procedures:                            recipes actually used (1 here)
  ▸ 0:              EXAMPLE MIG 131, aluminium
    id:               "proc_mig131"
    process:          gmaw 131
    material:         aluminium, 5 mm
    electrical:       21 V · 170 A · wire 9 m/min
    travel:           500 mm/min, k = 0.8
▸ access:                                reach planning (reserved for now)
  entry_ports:      []
  arm:              { reach_mm: null, tip_diameter_mm: null }
▸ seams:                                 5 welds, in execution order
  ▸ 0:              S5 first:  { id: "seam_09996072", sequence: 1, … }
  ▸ 1:              S4 second: { id: "seam_d0d4388d", sequence: 2, … }
  ▸ 2:              S2 third:  { id: "seam_c7add7e4", sequence: 3, … }
  ▸ 3:              S3 fourth: { id: "seam_08d7d8fe", sequence: 4, … }
  ▸ 4:              S1 last:   { id: "seam_f423ed6",  sequence: 5, … }
    (each seam opens into joint, weld_position, direction,
    procedure_ref, overrides, effective values, torch, start,
    end, weld_size, intermittent, wait_after_s, supervision,
    inspection, geometry with waypoints, derived values,
    access and checks — see 6.6 through 6.8)
▸ totals:                                the whole job at a glance
  seam_count:       5
  total_length_mm:  893.2
  arc_time_s:       107.18
  air_travel_mm:    872.6
  air_time_s:       5.82
  wait_time_s:      25
  estimated_cycle_time_s: 138
▸ validation:
  errors:           []                         nothing blocks export
  warnings:         []
▸ integrity:
  content_sha256:   "619a580b…"               full 64-char hash in the file
```

## 8. Weld physics in plain words

Every number in section 7 is one of the quantities below. This table says what each one physically is, what happens when you raise it, and what to watch for. The app computes the derived rows live and warns when you leave the procedure limits.

| Parameter | What it physically is | Turn it up means | Watch out for |
|---|---|---|---|
| Voltage (V) | Electrical pressure pushing the arc across the gap. Wider, flatter arc. | Wider bead, flatter profile, more spatter at the top end. | Too high burns through thin plate and throws spatter everywhere. |
| Current (A) | Flow of charge melting wire and base metal. The main penetration control. | Deeper penetration, faster melt-off, bigger bead. | Too high on thin material means burn-through; too low means the weld just sits on top (lack of fusion). |
| Travel speed (mm/min) | How fast the torch moves along the seam. | Less heat per millimetre: narrower bead, shallower penetration. | Too fast leaves a ropey, underfilled bead; too slow overheats and sags the joint. |
| Wire feed speed (m/min) | How fast wire is pushed into the arc. On most MIG/MAG sets this *is* the current knob. | More wire means more current draw and a bigger, hotter deposit. | Must stay in balance with voltage, or the arc stutters or stubs into the puddle. |
| Arc energy (kJ/mm) | Energy the arc delivers per millimetre: voltage × current × 60 ÷ (1000 × travel speed). Computed, never typed. | Hotter weld per millimetre. | High energy on thin plate distorts the part; pulsed or synergic modes make the simple average approximate, and the app flags that. |
| Heat input (kJ/mm) | The share of arc energy that actually stays in the part: efficiency `k` × arc energy (`k` 0.8 for MIG/MAG and flux-cored, 0.6 for TIG). Computed and checked against your WPS min/max. | Hotter heat-affected zone, slower cooling, softer but weaker microstructure. | Exceeding the WPS window voids the procedure qualification. This is the number inspectors ask about. |
| Arc time (s) | Seconds the arc is actually on: welded length ÷ travel speed × passes (stitch-adjusted for intermittent welds). Computed. | Longer jobs, more wire and gas used. | The costing and cycle-time basis: check it before quoting. |
| Throat `a` / leg `z` (mm) | The two ways to state fillet size: `a` is the throat thickness through the weld, `z` is the leg length along each plate (`a` ≈ 0.707 × `z` at a 90° corner). You enter one; the app derives the other. | Bigger weld, more passes, more heat. | Oversized single-pass legs trigger the multipass suggestion; undersized welds fail strength. |
| Passes | How many runs stack up the joint. | Each pass adds throat and heat in a controlled way instead of one huge hot pass. | More passes mean more arc time and more distortion to manage in the sequence. |
| Stick-out / CTWD (mm) | Contact-tip-to-work distance: how much wire sticks out. | Longer stick-out preheats the wire (hotter, softer arc); shorter gives a stiffer, more digging arc. | Wild stick-out swings the current around even if the dials never move. |
| Work angle (°) | Sideways tilt from the corner bisector. 0 aims straight into the corner. | Pushes heat and fill toward one plate. | Favouring the wrong side undercuts one plate and starves the other. |
| Travel angle (°) | Lean along the seam. Positive is pushing the torch, negative is dragging it. | Pushing gives a wider, shallower puddle you can see into; dragging digs deeper with better gas cover on some processes. | Gas-shielded processes usually want push; flux-cored usually wants drag (the app warns on FCAW push). |
| Approach / run-in (mm) | Distance the torch travels in before the arc starts, and the run-in at weld start. | Lets the motion stabilise so the arc strikes on a moving torch. | Skipping it puts the start defect (cold, lumpy) right on the joint edge. |
| Retract / crater fill | Distance the torch backs away, plus whether it dwells to fill the end crater. | A filled crater avoids the classic end-of-seam crack starter. | Skipping crater fill on aluminium and stainless is asking for crater cracks. |
| Stitch weld (intermittent) | Short welds with gaps: stitch length and pitch (start-to-start distance). | Less heat and less distortion on long thin panels, faster jobs. | Pitch too wide leaves the joint under-stitched for its load. |
| Wait after seam (s) | Cooling pause before the next seam starts (interpass time). | Lets heat soak out so the next weld starts on cooler metal. | Skipping waits stacks heat seam over seam and grows distortion. |
| Air speed (mm/s) | How fast the torch travels *between* seams with the arc off. | Shorter cycle time. | Too fast near clamps and fixtures risks a collision the straight-line air moves do not know about. |
| Waypoint spacing (mm) | Distance between exported robot poses along each seam. | Tighter spacing follows curves more faithfully. | Very tight spacing floods some controllers with points and causes stop-and-go motion. |

## 9. Limits

- EXAMPLE procedures are starting points, not recommendations. Always substitute your WPS values.
- Weld position is evaluated from the middle of each seam; curved or strongly sloping seams may need a manual override.
- Torch clearance is not checked yet (`access.status: not_checked`) and air moves are straight lines, so verify reach and collisions in the cell.
- Base metal is declared per procedure, not detected: STL files carry no material information, so the app trusts your selection (with conventional defaults per process).
- Work autosaves in this browser (IndexedDB, up to 5 projects in the top-bar switcher). It is not synced between browsers or machines; loading another part starts fresh in that project.
- The JSON carries no mesh, only the part hash — re-import strictly requires the same STL file.

## 10. Future ideas

Thoughts under exploration, with how each would likely be implemented:

- **Torch clearance check.** Cast rays from each waypoint along the torch axis (plus a small cone) against a spatial index of the part for the configured torch length; mark `access.status` blocked with the offending waypoint. Fits the existing `access`/`checks` blocks without a schema break.
- **Entry ports and arm reach (Armatrix-specific).** Let the user click openings to place ports (position, direction, diameter) and report per-seam straight-line distance versus configured arm reach, labelled as an estimate. Populates the currently reserved `access.entry_ports` and `access.arm` fields.
- **Distortion-balanced sequencing.** Beyond shortest air travel: order seams to alternate sides of the neutral plane and spread heat (the plan already tracks per-seam heat, so a heat-balance score and a 1.5x side-imbalance warning are natural next steps).
- **Weld map export.** A CSV/printable summary per seam (name, size, passes, position, procedure) alongside the JSON for the shop floor.
- **Simplified motion primitives.** Detect straight runs and arcs within the dense waypoint list (inside a chord tolerance) and export them as line/arc moves, since dense point streams can cause stop-and-go motion on some controllers.
- **Voxel clearance and free-space air moves.** Upgrade straight-line air moves with a coarse 3D grid that searches cube by cube for a collision-free path for inside-structure work, still labelled as estimates rather than arm kinematics.
