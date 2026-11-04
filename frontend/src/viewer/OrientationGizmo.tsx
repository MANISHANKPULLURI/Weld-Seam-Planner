import { useEffect, useRef } from "react";
import type { SceneController, ViewId } from "./SceneController";

type Props = {
  controller: SceneController | null;
  onView: (id: ViewId) => void;
};

const AXES: { id: ViewId; dir: [number, number, number]; label: string }[] = [
  { id: "right", dir: [1, 0, 0], label: "+X" },
  { id: "left", dir: [-1, 0, 0], label: "-X" },
  { id: "front", dir: [0, -1, 0], label: "-Y" },
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
      raf = requestAnimationFrame(draw);
      const w = canvas.width, h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      const isLight = document.documentElement.getAttribute("data-theme") === "light";
      ctx.fillStyle = isLight ? "rgba(246,246,238,0.9)" : "rgba(20,30,0,0.85)";
      ctx.strokeStyle = isLight ? "rgba(40,59,31,0.25)" : "rgba(70,91,50,0.5)";
      ctx.lineWidth = 1;
      const r = 32;
      const cx = w / 2, cy = h / 2;
      ctx.beginPath();
      ctx.arc(cx, cy, r + 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      const q = cam.quaternion;
      function rotate(v: [number, number, number]): [number, number, number] {
        const x = v[0], y = v[1], z = v[2];
        const qx = q.x, qy = q.y, qz = q.z, qw = q.w;
        const ix = qw * x + qy * z - qz * y;
        const iy = qw * y + qz * x - qx * z;
        const iz = qw * z + qx * y - qy * x;
        const iw = -qx * x - qy * y - qz * z;
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
        const px = cx + rotated[0] * 18;
        const py = cy - rotated[1] * 18;
        const alpha = rotated[2] > 0 ? 1 : 0.45;
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = a.color;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(px, py);
        ctx.stroke();
        ctx.fillStyle = a.color;
        ctx.beginPath();
        ctx.arc(px, py, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = isLight ? "#141E00" : "#F6F6EE";
        ctx.font = "bold 10px '42dot Sans', system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(a.label, px, py - 9);
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = isLight ? "#2B381F" : "#E97F01";
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
    if (bestDist < 20) onView(best);
    else onView("iso");
  }

  return (
    <div className="orientation-gizmo" aria-label="Orientation gizmo" role="group">
      <canvas
        ref={canvasRef}
        width={72}
        height={72}
        className="orientation-gizmo-canvas"
        onClick={handleClick}
        aria-label="Orientation gizmo. Click an axis to switch view"
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
