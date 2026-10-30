import type { AssetUrls } from "@headless-lms/editor";

type Node = Record<string, unknown> & { children?: unknown };

function mapNodes<T>(nodes: T[], at: (node: Node) => Node): T[] {
  return nodes.map((node) => {
    if (typeof node !== "object" || node === null) {
      return node;
    }
    const mapped = at(node as Node);
    return (
      Array.isArray(mapped.children)
        ? { ...mapped, children: mapNodes(mapped.children, at) }
        : mapped
    ) as T;
  });
}

function withoutUrl({ url: _url, ...node }: Node): Node {
  return node;
}

export function withAssetUrls<T>(nodes: T[], assetUrls: AssetUrls): T[] {
  return mapNodes(nodes, (node) => {
    if (typeof node.assetId !== "string") {
      return node;
    }
    const url = assetUrls[node.assetId];
    return url ? { ...node, url } : withoutUrl(node);
  });
}

export function withoutAssetUrls<T>(nodes: T[]): T[] {
  return mapNodes(nodes, (node) => (typeof node.assetId === "string" ? withoutUrl(node) : node));
}
