export function healMeshBoundaries(boundaryRegistry: Map<number, number[]>, currentIndexArray: Int32Array): Int32Array {

  const repairedIndices = Array.from(currentIndexArray);

  const globalVisitedNodes = new Set<number>();

  for (const [startNode] of boundaryRegistry) {

    if (globalVisitedNodes.has(startNode)) continue;

    const dynamicLoopPath: number[] = [];

    let current: number | undefined = startNode;

    let isLoopClosed = false;

    while (current !== undefined && boundaryRegistry.has(current) && !globalVisitedNodes.has(current)) {

      dynamicLoopPath.push(current);
      globalVisitedNodes.add(current);

      const connectedOptions: number[] = boundaryRegistry.get(current) || [];

      let nextTarget: number | null = null;

      for (const opt of connectedOptions as number[]) {

        if (!dynamicLoopPath.includes(opt)) {
          nextTarget = opt;
          break;
        }
      }

      if (nextTarget !== null) {

        if (nextTarget === startNode && dynamicLoopPath.length >= 2) {
          isLoopClosed = true;
          break;
        }

        current = nextTarget;
      } else {

        const opts: number[] = boundaryRegistry.get(current) || [];

        if (opts.includes(startNode) && dynamicLoopPath.length >= 3) {
          isLoopClosed = true;
        }

        break;
      }
    }

    if (isLoopClosed && dynamicLoopPath.length >= 3) {

      const pivotNode = dynamicLoopPath[0]!;

      for (let i = 1; i < dynamicLoopPath.length - 1; i++) {
        repairedIndices.push(pivotNode!, dynamicLoopPath[i]!, dynamicLoopPath[i + 1]!);
      }
    }
  }

  return new Int32Array(repairedIndices);
}
