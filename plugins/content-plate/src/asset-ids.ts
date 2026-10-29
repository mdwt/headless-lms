export function assetIds(config: unknown): string[] {
  const ids = new Set<string>();
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (typeof node !== "object" || node === null) {
      return;
    }
    const { assetId, children } = node as { assetId?: unknown; children?: unknown };
    if (typeof assetId === "string" && assetId) {
      ids.add(assetId);
    }
    visit(children);
  };
  visit(config);
  return [...ids];
}
