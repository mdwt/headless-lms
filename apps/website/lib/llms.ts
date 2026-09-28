import { readFileSync } from "node:fs";
import path from "node:path";
import { blog, changelog, source } from "@/lib/source";
import { absoluteUrl, markdownUrl, siteConfig } from "@/lib/site";

export type Entry = {
  url: string;
  title: string;
  description: string;
  file: string;
};

function entriesOf(collection: "docs" | "blog" | "changelog"): Entry[] {
  const loader = collection === "docs" ? source : collection === "blog" ? blog : changelog;
  return loader.getPages().map((page) => ({
    url: page.url,
    title: page.data.title ?? "",
    description: page.data.description ?? "",
    file: path.join(process.cwd(), "content", collection, page.path),
  }));
}

export const docsEntries = () => entriesOf("docs");

export const blogEntries = () => entriesOf("blog").sort((a, b) => (a.url < b.url ? 1 : -1));

export const changelogEntries = () => entriesOf("changelog");

export function isApiReference(url: string) {
  return url.startsWith("/docs/api/");
}

const operationsPattern = /operations=\{(\[[\s\S]*?])\}/;
const cardPattern = /^[ \t]*<Card\s+([^>]*?)\/>/gm;
const attrPattern = /(\w+)=(?:"([^"]*)"|\{"([^"]*)"\})/g;

function readOperations(raw: string) {
  const match = operationsPattern.exec(raw);
  if (!match) {
    return [];
  }
  try {
    return JSON.parse(match[1]) as { path: string; method: string }[];
  } catch {
    return [];
  }
}

export function endpointLabel(file: string) {
  const raw = readFileSync(file, "utf8");
  return readOperations(raw)
    .map((op) => `${op.method.toUpperCase()} ${op.path}`)
    .join(", ");
}

function cardsToList(body: string) {
  return body.replace(cardPattern, (_, attrs: string) => {
    const values: Record<string, string> = {};
    for (const [, key, quoted, braced] of attrs.matchAll(attrPattern)) {
      values[key] = quoted ?? braced;
    }
    const link = `- [${values.title ?? ""}](${values.href ? absoluteUrl(values.href) : ""})`;
    return values.description ? `${link}: ${values.description}` : link;
  });
}

/** Raw MDX turned into plain Markdown an agent can read without a JSX runtime. */
export function toMarkdown(entry: Entry) {
  const raw = readFileSync(entry.file, "utf8");
  const operations = readOperations(raw);

  let body = raw
    .replace(/^---\n[\s\S]*?\n---\n/, "")
    .replace(/^export default function Layout[\s\S]*$/m, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

  body = cardsToList(body)
    .replace(/<\/?Cards>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const head = [`# ${entry.title}`];
  if (operations.length > 0) {
    head.push(
      "",
      ...operations.map((op) => `\`${op.method.toUpperCase()} ${op.path}\``),
      "",
      `Request and response schemas: ${absoluteUrl("/openapi.json")}`,
    );
  } else if (entry.description) {
    head.push("", entry.description);
  }

  return [`<!-- ${absoluteUrl(entry.url)} -->`, "", ...head, body ? `\n${body}` : ""]
    .join("\n")
    .trim()
    .concat("\n");
}

function listItem(entry: Entry) {
  const suffix = isApiReference(entry.url) ? endpointLabel(entry.file) : entry.description;
  const link = `- [${entry.title}](${markdownUrl(entry.url)})`;
  return suffix ? `${link}: ${suffix}` : link;
}

function section(title: string, entries: Entry[]) {
  if (entries.length === 0) {
    return [];
  }
  return [`## ${title}`, "", ...entries.map(listItem), ""];
}

export function llmsTxt() {
  const docs = docsEntries();
  const guides = docs.filter((entry) => !isApiReference(entry.url));
  const api = docs.filter((entry) => isApiReference(entry.url));

  return [
    `# ${siteConfig.name}`,
    "",
    `> ${siteConfig.description}`,
    "",
    `${siteConfig.name} is ${siteConfig.license}-licensed and self-hosted. The domain lives in \`@headless-lms/core\`, the HTTP layer in \`@headless-lms/server\`, and capabilities such as email, storage and workflows are swappable adapters. Every route validates against shared Zod schemas, which produce the OpenAPI spec, which generates the typed SDK, so API, docs and client stay in sync.`,
    "",
    "Append `.md` to any page URL on this site to get its Markdown source.",
    "",
    ...section("Documentation", guides),
    ...section("API reference", api),
    ...section("Blog", blogEntries()),
    "## Changelog",
    "",
    `- [Changelog](${markdownUrl("/changelog")}): New features, improvements, and fixes in ${siteConfig.name}.`,
    "",
    "## Optional",
    "",
    `- [OpenAPI specification](${absoluteUrl("/openapi.json")}): the complete machine-readable API contract.`,
    `- [Full documentation as one file](${absoluteUrl("/llms-full.txt")}): every page inlined.`,
    `- [Source repository](${siteConfig.githubUrl}): issues, releases and the reference implementation.`,
    "",
  ].join("\n");
}

export function llmsFullTxt() {
  const docs = docsEntries();

  return [
    `# ${siteConfig.name}`,
    "",
    `> ${siteConfig.description}`,
    "",
    `Full documentation, blog and changelog for ${siteConfig.name}, concatenated. Canonical site: ${siteConfig.url}`,
    "",
    ...docs.filter((entry) => !isApiReference(entry.url)).map(toMarkdown),
    ...docs.filter((entry) => isApiReference(entry.url)).map(toMarkdown),
    ...blogEntries().map(toMarkdown),
    ...changelogEntries().map(toMarkdown),
  ].join("\n---\n\n");
}
