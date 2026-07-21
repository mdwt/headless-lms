// Structural check for the 'plate-nodes-v1' config format: an array of Slate
// nodes, each an object with a `children` array. Deliberately shallow — the
// backend stores the blob opaquely, so this only guards the editor/renderer
// against feeding Plate something that isn't a node list at all.

export function isNodeList(config: unknown): boolean {
  return (
    Array.isArray(config) &&
    config.length > 0 &&
    config.every(
      (node) =>
        typeof node === "object" &&
        node !== null &&
        Array.isArray((node as { children?: unknown }).children),
    )
  );
}

export function validate(config: unknown): { ok: true } | { ok: false; errors: string[] } {
  if (!Array.isArray(config)) {
    return { ok: false, errors: ["config must be an array of nodes"] };
  }
  const errors: string[] = [];
  config.forEach((node, i) => {
    if (typeof node !== "object" || node === null) {
      errors.push(`node ${i} is not an object`);
    } else if (!Array.isArray((node as { children?: unknown }).children)) {
      errors.push(`node ${i} has no children array`);
    }
  });
  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}
