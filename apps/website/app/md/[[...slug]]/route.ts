import { notFound } from "next/navigation";
import { blogEntries, changelogEntries, docsEntries, toMarkdown } from "@/lib/llms";
import { siteConfig } from "@/lib/site";

export const dynamic = "force-static";
export const dynamicParams = false;

function pages() {
  const changelog = changelogEntries();
  return [
    ...docsEntries(),
    ...blogEntries(),
    {
      url: "/changelog",
      title: "Changelog",
      description: `New features, improvements, and fixes in ${siteConfig.name}.`,
      body: changelog.map(toMarkdown).join("\n---\n\n"),
    },
  ];
}

export function generateStaticParams() {
  return pages().map((page) => ({ slug: page.url.split("/").filter(Boolean) }));
}

export async function GET(_request: Request, context: { params: Promise<{ slug?: string[] }> }) {
  const { slug = [] } = await context.params;
  const url = `/${slug.join("/")}`;
  const page = pages().find((entry) => entry.url === url);
  if (!page) {
    notFound();
  }

  const body = "body" in page ? page.body : toMarkdown(page);

  return new Response(body, {
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  });
}
