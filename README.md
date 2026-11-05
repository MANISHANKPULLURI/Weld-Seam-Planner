# Armatrix Weld Seam Planner

Upload an STL, pick the weld seams, set weld parameters per seam, order them, and export a robot-ready JSON weld job. Mesh processing runs in your browser; the part never leaves your machine.

## Run locally

Requires [Bun](https://bun.sh) 1.3+.

```bash
bun install
bun run dev        # frontend + API (API also serves the built frontend in production)
bun run test       # core, frontend and backend tests
bun run check      # TypeScript
bun run build      # production frontend build (served by the backend)
```

Production: `docker build -t weld-planner . && docker run -p 8000:8000 weld-planner`, or `fly deploy` (see `fly.toml`).

## The five steps

1. **Part**: drop an STL. It is parsed, welded, oriented and checked (open edges, inside-out faces, separate bodies), with optional repair. Confirm units and the up axis.
2. **Seams**: **Detect seams** suggests inside corners, plates that touch, and parts that pass through each other. **Review one by one** frames each suggestion and you press **K** (keep) or **D** (drop), or use ✓ / ✕ in the list. Add missed ones with **Pick edge** or **Draw** (snaps to seam ends, corners, edges). Edit with rename, reverse, split (slider, live preview or equal parts), merge and delete. **Section → Work here only** limits all work to one side of a cut.
3. **Procedures**: a library of weld procedures (EXAMPLE MAG 135, MIG 131, FCAW 136, TIG 141 to start; editable, saved in the browser). Apply to seams in bulk, then adjust any seam: weld size (a/z), passes, stitches, its own current/voltage/speed, torch angles, approach/retract, position. Heat input, arc time and position are calculated live, with warnings.
4. **Sequence**: **Auto order** (nearest neighbour + 2-opt, choosing each seam's direction) or drag to reorder; direction and wait per seam; the part shows numbers, arrows and air moves; totals for arc, air, waits and cycle. **▶ Play weld** runs a torch along every seam in order at its real travel speed (1-30×), lighting up welded seams.
5. **Review**: job name, notes, status; checks (errors block export, click to jump to the seam); preview, download or copy the JSON; import a job back onto the same part.

Save checkpoint / Reset (top bar) returns to a saved point or the freshly loaded part. **Focus** (on a seam or body) zooms in and ghosts the rest. Every kept seam has its own colour; split / merge / reverse pulse and label what changed, with Undo (Ctrl/⌘ Z). Back / Next at the bottom of each step.

## Architecture

```
packages/core   @weld/core: STL parsing, mesh pipeline, seam detection and editing, weld
                calculations, sequencing, job compiler and the Zod schema. Pure TypeScript,
                shared by frontend and backend.
frontend        React + Vite + Three.js. Mesh work runs in a Web Worker; Zustand store;
                SceneController renders the part, seams and overlays.
backend         Bun + Hono. Serves the built frontend and the API below.
```

| Endpoint | Purpose |
|---|---|
| `GET /api/v1/health` | Liveness |
| `POST /api/v1/mesh/validate`, `/repair` | Server-side mesh check / repair (same core code) |
| `GET /api/v1/schema/weld-job` | JSON Schema of the export |
| `GET /api/v1/procedures/presets` | EXAMPLE procedures |
| `POST /api/v1/weld-jobs/compile` | Build a sealed weld job from seams + settings |
| `POST /api/v1/weld-jobs/validate` | Validate a job against the schema and check its content hash |

## How it works (short)

- **Mesh**: vertices merged by a hash grid, half-edge topology, winding made consistent (closed shells by propagation + signed volume, cavities by winding number; assemblies keep the file's winding and only fix reversed islands).
- **Detection**: dihedral angle per edge; concave edges with a 45-120° bend are fillet candidates (rounded bands rejected); touching bodies found with a BVH closest-point probe; crossing bodies by triangle intersection. Pieces are chained, deduplicated and given stable IDs. Accuracy suite: 8 known weldments, rotated: 100% recall, < 0.01 mm error.
- **Weld maths**: arc energy = U·I·60 / (1000·v) kJ/mm, heat input = k·arc energy (k 0.8 MAG/MIG/FCAW, 0.6 TIG); arc time = welded length / speed × passes; throat a = z·cos(opening/2); simplified ISO 6947 / AWS position from the seam direction and surfaces.
- **Torch frame**: z axis along the corner bisector into the weld, tilted by work-angle offset and travel angle (positive = push); exported as axis, contact-tip point and quaternion per waypoint.

## Export format (`.weldjob.json`, schema 1.0.0)

All lengths in millimetres, job frame right-handed, Z up, gravity −Z. Full JSON Schema: `backend/schema/weld-job.schema.json`.

| Field | Meaning |
|---|---|
| `job` | `id`, `name`, `created_at`, `status` (draft = arc off, approved = arc on), `notes`, `execution` (supervision, `air_speed_mm_s`, `waypoint_spacing_mm`) |
| `frame` | `units: "mm"`, `up_axis`, `gravity`, `part_to_job` (`scale_to_mm`, translation, rotation quaternion xyzw) |
| `part` | file name, `sha256` of the original bytes, triangle count, bounding box (mm), `repaired` |
| `procedures[]` | procedures used: process (ISO 4063), wire, gas, voltage, current, wire feed, travel speed, efficiency `k`, limits, seam defaults |
| `seams[]` | in execution order; `sequence` equals position |
| `seams[].joint` | type (fillet, butt, corner, unknown), dihedral angle |
| `seams[].weld_position` | ISO 6947 code, AWS code, derived or user |
| `seams[].procedure_ref`, `overrides`, `effective` | which procedure, what this seam changes, and the values the robot should use |
| `seams[].weld_size` | basis `a` (throat) or `z` (leg), value, passes |
| `seams[].intermittent` | stitch length and pitch, or null |
| `seams[].torch` | work-angle offset, travel angle (positive push), stick-out |
| `seams[].start` / `end` | approach / run-in, retract / crater fill |
| `seams[].wait_after_s` | pause after the seam |
| `seams[].geometry.waypoints[]` | `s_mm`, `position_mm`, `tangent`, `surface_normals`, `torch_axis`, `contact_tip_mm`, `tool_quaternion_xyzw` |
| `seams[].derived` | arc energy, heat input, arc time |
| `totals` | seam count, length, arc time, air travel and time, waits, estimated cycle time |
| `validation` | `errors` (block export) and `warnings`, each with path, code and message |
| `integrity.content_sha256` | SHA-256 of the canonical JSON (sorted keys) without this field |

## Limits

- EXAMPLE procedures are starting points, not recommendations; use your WPS.
- Weld position uses the middle of each seam; curved or sloping seams may need an override.
- Torch clearance is not checked (`access.status: not_checked`); air moves are straight lines.
- Work is autosaved in this browser (IndexedDB), so a refresh or closed tab resumes where you were; it is not synced between browsers or machines. Loading another part starts fresh.
