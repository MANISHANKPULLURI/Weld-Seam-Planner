import { useEffect, useRef } from "react";
import type { SceneController, ViewId } from "./SceneController";

type Props = {
  controller: SceneController | null;
  onView: (id: ViewId) => void;
};

const AXES: { id: ViewId; dir: [number, number, number]; label: string }[] = [
  { id: "right", dir: [1, 0, 0], label: "+X" },
  { id: "left", dir: [-1, 0, 0], label: "-X" },
  { id: "front", dir: [0, -1, 0], label: "-Y" }, // front is -Y looking +Y per Z-up
  { id: "back", dir: [0, 1, 0], label: "+Y" },
  { id: "top", dir: [0, 0, 1], label: "+Z" },
  { id: "bottom", dir: [0, 0, -1], label: "-Z" },
];

export function OrientationGizmo({ controller, onView }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!controller || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    const draw = () => {
      const cam = controller.getCamera() as unknown as { quaternion: { x:number;y:number;z:number;w:number } };
      // Use camera quaternion to rotate axes
      // We'll compute projected 2D positions for each axis dir
      // Simple: use three quaternion rotation via DOMMatrix or manual
      // Import THREE lazily to avoid circular
      raf = requestAnimationFrame(draw);
      const w = canvas.width, h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      // background
      const isLight = document.documentElement.getAttribute("data-theme") === "light";
      ctx.fillStyle = isLight ? "rgba(246,246,238,0.9)" : "rgba(20,30,0,0.85)";
      ctx.strokeStyle = isLight ? "rgba(40,59,31,0.25)" : "rgba(70,91,50,0.5)";
      ctx.lineWidth = 1;
      const r = 32;
      const cx = w / 2, cy = h / 2;
      // circle
      ctx.beginPath();
      ctx.arc(cx, cy, r + 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // draw axes
      // camera up is Z, so we need to project world axes into view space
      // Use camera quaternion inverse to transform world dir into camera space, then orthographic project (x,y)
      // Approximate by using quaternion rotation
      const q = cam.quaternion;
      // helper to rotate vector by quaternion
      function rotate(v: [number, number, number]): [number, number, number] {
        // q * v * q^-1
        const x = v[0], y = v[1], z = v[2];
        const qx = q.x, qy = q.y, qz = q.z, qw = q.w;
        // calculate q * v
        const ix = qw * x + qy * z - qz * y;
        const iy = qw * y + qz * x - qx * z;
        const iz = qw * z + qx * y - qy * x;
        const iw = -qx * x - qy * y - qz * z;
        // result = (q*v)*q^-1
        const rx = ix * qw + iw * -qx + iy * -qz - iz * -qy;
        const ry = iy * qw + iw * -qy + iz * -qx - ix * -qz;
        const rz = iz * qw + iw * -qz + ix * -qy - iy * -qx;
        return [rx, ry, rz];
      }
      const colors: Record<string,string> = { X: "#ff4d4d", Y: "#2d8a2d", Z: "#2a5bd7" };
      const axesDefs: { dir:[number,number,number]; label:string; color:string }[] = [
        { dir: [1,0,0], label: "X", color: colors.X! },
        { dir: [0,1,0], label: "Y", color: colors.Y! },
        { dir: [0,0,1], label: "Z", color: colors.Z! },
      ];
      for (const a of axesDefs) {
        const rotated = rotate(a.dir);
        // orthographic projection: drop z, scale
        const px = cx + rotated[0] * 18;
        const py = cy - rotated[1] * 18; // y flipped
        // depth cue: if rotated z >0 in front
        const alpha = rotated[2] > 0 ? 1 : 0.45;
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = a.color;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(px, py);
        ctx.stroke();
        // dot at tip
        ctx.fillStyle = a.color;
        ctx.beginPath();
        ctx.arc(px, py, 4, 0, Math.PI * 2);
        ctx.fill();
        // label
        ctx.fillStyle = isLight ? "#141E00" : "#F6F6EE";
        ctx.font = "bold 10px '42dot Sans', system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(a.label, px, py - 9);
      }
      ctx.globalAlpha = 1;
      // center
      ctx.fillStyle = isLight ? "#283B1F" : "#EF7F01";
      ctx.beginPath();
      ctx.arc(cx, cy, 2, 0, Math.PI * 2);
      ctx.fill();
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [controller]);

  function handleClick(e: React.MouseEvent) {
    const canvas = canvasRef.current;
    if (!canvas || !controller) { onView("iso"); return; }
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left - rect.width / 2;
    const y = e.clientY - rect.top - rect.height / 2;
    if (Math.hypot(x, y) < 8) { onView("iso"); return; }
    // project each axis direction to find nearest tip
    const cam = controller.getCamera() as unknown as { quaternion: { x:number;y:number;z:number;w:number } };
    const q = cam.quaternion;
    function rotate(v: [number, number, number]): [number, number, number] {
      const x = v[0], y = v[1], z = v[2];
      const qx = q.x, qy = q.y, qz = q.z, qw = q.w;
      const ix = qw*x + qy*z - qz*y;
      const iy = qw*y + qz*x - qx*z;
      const iz = qw*z + qx*y - qy*x;
      const iw = -qx*x - qy*y - qz*z;
      const rx = ix*qw + iw*-qx + iy*-qz - iz*-qy;
      const ry = iy*qw + iw*-qy + iz*-qx - ix*-qz;
      const rz = iz*qw + iw*-qz + ix*-qy - iy*-qx;
      return [rx, ry, rz];
    }
    let best: ViewId = "iso";
    let bestDist = Infinity;
    for (const a of AXES) {
      const rot = rotate(a.dir);
      const px = rot[0]*18;
      const py = -rot[1]*18;
      const d = Math.hypot(px - x, py - y);
      if (d < bestDist) { bestDist = d; best = a.id; }
    }
    // require click within 16px of tip, else fallback to iso
    if (bestDist < 20) onView(best);
    else onView("iso");
  }

  // keyboard accessibility: expose buttons for each view
  return (
    <div className="orientation-gizmo" aria-label="Orientation gizmo" role="group">
      <canvas
        ref={canvasRef}
        width={72}
        height={72}
        className="orientation-gizmo-canvas"
        onClick={handleClick}
        aria-label="Orientation gizmo — click to switch view"
        title="Click to switch standard view (center = isometric)"
        style={{ display: "block", cursor: "pointer" }}
      />
      <div className="orientation-gizmo-legend" aria-hidden="true">
        <span style={{ color: "#ff4d4d" }}>X</span> <span style={{ color: "#2d8a2d" }}>Y</span> <span style={{ color: "#2a5bd7" }}>Z</span>
      </div>
      <div className="orientation-gizmo-actions">
        {AXES.map((a) => (
          <button key={a.id} type="button" className="gizmo-btn" onClick={() => onView(a.id)} aria-label={`View ${a.label}`} title={a.label}>
            {a.label.slice(1)}
          </button>
        ))}
      </div>
    </div>
  );
}
