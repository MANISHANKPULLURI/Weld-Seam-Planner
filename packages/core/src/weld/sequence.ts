type P = [number, number, number];
export type Ends = { start: P; end: P; closed: boolean };
export type Plan = { order: number[]; reversed: boolean[]; airMm: number };

const dist = (a: P, b: P) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const exitOf = (s: Ends, rev: boolean) => (s.closed ? s.start : rev ? s.start : s.end);
const entryOf = (s: Ends, rev: boolean) => (s.closed ? s.start : rev ? s.end : s.start);


/**
 * sum straight-line air travel between ordered seam endpoints
 */
export function airTravel(seams: Ends[], order: number[], reversed: boolean[]): number {
  let total = 0;
  for (let i = 1; i < order.length; i++) total += dist(exitOf(seams[order[i - 1]!]!, reversed[order[i - 1]!]!), entryOf(seams[order[i]!]!, reversed[order[i]!]!));
  return total;
}




/**
 * order seams greedily then improve the tour with 2-opt reversals
 */
export function planOrder(seams: Ends[], options: { keepDirection?: boolean; maxPasses?: number } = {}): Plan {
  const n = seams.length;
  const reversed = new Array<boolean>(n).fill(false);
  if (n === 0) return { order: [], reversed, airMm: 0 };

  const order = [0];
  const used = new Set([0]);
  while (order.length < n) {
    const from = exitOf(seams[order[order.length - 1]!]!, reversed[order[order.length - 1]!]!);
    let best = -1, bestRev = false, bestD = Infinity;
    for (let j = 0; j < n; j++) {
      if (used.has(j)) continue;
      for (const rev of options.keepDirection ? [false] : [false, true]) {
        const d = dist(from, entryOf(seams[j]!, rev));
        if (d < bestD) { bestD = d; best = j; bestRev = rev; }
      }
    }
    order.push(best); used.add(best); reversed[best] = bestRev;
  }

  
  
  if (!options.keepDirection && n > 2) {
    
    const exitAt = (pos: number) => exitOf(seams[order[pos]!]!, reversed[order[pos]!]!);
    const entryAt = (pos: number) => entryOf(seams[order[pos]!]!, reversed[order[pos]!]!);
    let improved = true, passes = 0;
    while (improved && passes++ < (options.maxPasses ?? 50)) {
      improved = false;
      for (let i = 0; i < n - 1; i++) {
        for (let k = i + 1; k < n; k++) {
          let delta = 0;
          if (i > 0) delta += dist(exitAt(i - 1), exitAt(k)) - dist(exitAt(i - 1), entryAt(i));
          if (k < n - 1) delta += dist(entryAt(i), entryAt(k + 1)) - dist(exitAt(k), entryAt(k + 1));
          if (delta < -1e-9) {
            const run = order.slice(i, k + 1);
            for (const sIdx of run) reversed[sIdx] = !reversed[sIdx];
            order.splice(i, run.length, ...run.reverse());
            improved = true;
          }
        }
      }
    }
  }

  return { order, reversed, airMm: airTravel(seams, order, reversed) };
}
