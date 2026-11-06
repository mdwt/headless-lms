import type { Nodes } from "mdast";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { mentionTokens } from "@headless-lms/core/discussion";
import type { BodyParser, ParsedBody } from "@headless-lms/core/shared/ports";

const ASSET = "asset:";
const BLOCKS = new Set(["root", "blockquote", "list", "listItem", "table"]);
const SILENT = new Set([
  "html",
  "definition",
  "imageReference",
  "footnoteDefinition",
  "thematicBreak",
]);

const processor = unified().use(remarkParse).use(remarkGfm);

export class MarkdownBodyParser implements BodyParser {
  parse(body: string): ParsedBody {
    const mentions = new Set<string>();
    const assetIds = new Set<string>();
    const read = (node: Nodes): string => {
      switch (node.type) {
        case "text":
          for (const id of mentionTokens(node.value)) {
            mentions.add(id);
          }
          return node.value;
        case "inlineCode":
        case "code":
          return node.value;
        case "break":
          return "\n";
        case "image":
          if (node.url.startsWith(ASSET) && node.url.length > ASSET.length) {
            assetIds.add(node.url.slice(ASSET.length));
          }
          return "";
        case "link":
          if (node.url.startsWith(ASSET) && node.url.length > ASSET.length) {
            assetIds.add(node.url.slice(ASSET.length));
          }
          break;
      }
      if (SILENT.has(node.type) || !("children" in node)) {
        return "";
      }
      const parts = (node.children as Nodes[]).map(read);
      if (BLOCKS.has(node.type)) {
        return parts.filter((part) => part.length > 0).join("\n");
      }
      return parts.join(node.type === "tableRow" ? " " : "");
    };
    const text = read(processor.parse(body))
      .replace(/[ \t]+\n/g, "\n")
      .trim();
    return { text, mentions: [...mentions], assetIds: [...assetIds] };
  }
}
