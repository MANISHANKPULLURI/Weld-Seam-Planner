

const PALETTE = ["#7FB069", "#E9B475", "#6CB4EE", "#C792EA", "#4ECDC4", "#F78C6B", "#FFD166", "#A3BE8C", "#82AAFF", "#FF8FA3"];

/**
 * pick a stable palette colour for a seam
 */
export function seamColor(seam: { id: string; name: string }): string {
  const n = /^S(\d+)$/.exec(seam.name)?.[1];
  if (n) return PALETTE[(Number(n) - 1) % PALETTE.length]!;
  let h = 0;
  for (const ch of seam.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length]!;
}
