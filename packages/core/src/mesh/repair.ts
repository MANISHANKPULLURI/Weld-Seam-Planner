// Walks each closed boundary loop and fills it with a triangle fan from its first vertex.
// Winding of the new faces is fixed afterwards by orientFaces.
export function fillBoundaryLoops(registry: Map<number, number[]>, indices: Uint32Array): Uint32Array {

  const added: number[] = [];
  const visited = new Set<number>();

  for (const [startNode] of registry) {

    if (visited.has(startNode)) continue;

    const loop: number[] = [];
    let current: number | undefined = startNode;
    let closed = false;

    while (current !== undefined && registry.has(current) && !visited.has(current)) {

      loop.push(current);
      visited.add(current);

      const options: number[] = registry.get(current) ?? [];
      const next = options.find((o) => !loop.includes(o));

      if (next === undefined) {
        closed = options.includes(startNode) && loop.length >= 3;
        break;
      }

      if (next === startNode && loop.length >= 2) {
        closed = true;
        break;
      }

      current = next;
    }

    if (closed && loop.length >= 3) {
      for (let i = 1; i < loop.length - 1; i++) added.push(loop[0]!, loop[i + 1]!, loop[i]!);
    }
  }

  if (added.length === 0) return indices;

  const out = new Uint32Array(indices.length + added.length);
  out.set(indices);
  out.set(added, indices.length);
  return out;
}
