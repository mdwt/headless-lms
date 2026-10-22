function collect(nodes: unknown, found: string[]): void {
  if (!Array.isArray(nodes)) {
    return;
  }
  for (const node of nodes) {
    if (typeof node !== "object" || node === null) {
      continue;
    }
    const { assetId, children } = node as { assetId?: unknown; children?: unknown };
    if (typeof assetId === "string" && assetId !== "" && !found.includes(assetId)) {
      found.push(assetId);
    }
    collect(children, found);
  }
}

export function assetIds(config: unknown): string[] {
  const found: string[] = [];
  collect(config, found);
  return found;
}
