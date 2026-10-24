import type { AssetUrls } from "@headless-lms/editor";

function withUrl(node: unknown, assetUrls: AssetUrls): unknown {
  if (typeof node !== "object" || node === null) {
    return node;
  }
  const { assetId, children } = node as { assetId?: unknown; children?: unknown };
  const url = typeof assetId === "string" ? assetUrls[assetId] : undefined;
  return {
    ...node,
    ...(url ? { url } : {}),
    ...(Array.isArray(children)
      ? { children: children.map((child) => withUrl(child, assetUrls)) }
      : {}),
  };
}

export function withAssetUrls<T>(nodes: T[], assetUrls: AssetUrls | undefined): T[] {
  if (!assetUrls) {
    return nodes;
  }
  return nodes.map((node) => withUrl(node, assetUrls) as T);
}
