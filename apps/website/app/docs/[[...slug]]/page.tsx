import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DocsBody, DocsDescription, DocsPage, DocsTitle } from "fumadocs-ui/layouts/docs/page";
import { createRelativeLink } from "fumadocs-ui/mdx";
import { source } from "@/lib/source";
import { openapi } from "@/lib/openapi";
import { OpenAPIPage } from "@/components/api-page";
import type { OpenAPIPageProps_Preloaded } from "fumadocs-openapi/ui";
import { getMDXComponents } from "@/components/mdx";
import { siteConfig } from "@/lib/site";
import { pageMetadata } from "@/lib/metadata";
import { breadcrumbs, jsonLdProps } from "@/lib/structured-data";

type Props = {
  params: Promise<{ slug?: string[] }>;
};

function trailFor(slug: string[] = []) {
  const trail = [{ name: "Docs", url: "/docs" }];
  let url = "/docs";
  for (const segment of slug) {
    url = `${url}/${segment}`;
    const page = source.getPageByHref(url);
    trail.push({ name: page?.page.data.title ?? segment, url });
  }
  return trail;
}

export default async function Page(props: Props) {
  const params = await props.params;
  const page = source.getPage(params.slug);
  if (!page) {
    notFound();
  }

  const MDX = page.data.body;

  return (
    <DocsPage toc={page.data.toc} full={page.data.full}>
      <script {...jsonLdProps(breadcrumbs(trailFor(params.slug)))} />
      <DocsTitle>{page.data.title}</DocsTitle>
      <DocsDescription>{page.data.description}</DocsDescription>
      <DocsBody>
        <MDX
          components={getMDXComponents({
            a: createRelativeLink(source, page),
            OpenAPIPage: async (props: Omit<OpenAPIPageProps_Preloaded, "preloaded">) => (
              <OpenAPIPage {...await openapi.preloadOpenAPIPage(page)} {...props} />
            ),
          })}
        />
      </DocsBody>
    </DocsPage>
  );
}

export async function generateStaticParams() {
  return source.generateParams();
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const params = await props.params;
  const page = source.getPage(params.slug);
  if (!page) {
    notFound();
  }

  return pageMetadata({
    title: page.data.title,
    description: page.data.description ?? `${page.data.title}. ${siteConfig.name} documentation.`,
    path: page.url,
    type: "article",
    markdown: `${page.url}.md`,
  });
}
