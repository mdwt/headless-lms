import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { blog } from "@/lib/source";
import { getMDXComponents } from "@/components/mdx";
import { absoluteUrl, siteConfig } from "@/lib/site";
import { pageMetadata } from "@/lib/metadata";
import { jsonLdProps } from "@/lib/structured-data";

type Props = {
  params: Promise<{ slug: string }>;
};

const dateFormat = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "long",
  day: "numeric",
});

export default async function BlogPostPage(props: Props) {
  const params = await props.params;
  const post = blog.getPage([params.slug]);
  if (!post) {
    notFound();
  }

  const MDX = post.data.body;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.data.title,
    description: post.data.description,
    author: {
      "@type": "Person",
      name: post.data.author,
    },
    datePublished: post.data.date,
    dateModified: post.data.date,
    url: absoluteUrl(post.url),
    mainEntityOfPage: absoluteUrl(post.url),
    image: absoluteUrl(`${post.url}/opengraph-image`),
    inLanguage: "en",
    isPartOf: { "@type": "Blog", "@id": absoluteUrl("/blog") },
    publisher: { "@id": absoluteUrl("/#organization") },
  };

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-16 sm:px-6">
        <script {...jsonLdProps(jsonLd)} />
        <article>
          <header>
            <Link
              href="/blog"
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              ← All posts
            </Link>
            <h1 className="mt-6 text-3xl font-semibold tracking-tight sm:text-4xl">
              {post.data.title}
            </h1>
            <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
              <span>{post.data.author}</span>
              <span aria-hidden>·</span>
              <time dateTime={post.data.date}>{dateFormat.format(new Date(post.data.date))}</time>
            </div>
          </header>
          <div className="prose mt-10 min-w-0">
            <MDX components={getMDXComponents()} />
          </div>
        </article>
      </main>
      <SiteFooter />
    </div>
  );
}

export function generateStaticParams() {
  return blog.getPages().map((post) => ({ slug: post.slugs[0] }));
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const params = await props.params;
  const post = blog.getPage([params.slug]);
  if (!post) {
    notFound();
  }

  return {
    authors: [{ name: post.data.author }],
    ...pageMetadata({
      title: post.data.title,
      description: post.data.description ?? siteConfig.description,
      path: post.url,
      type: "article",
      markdown: `${post.url}.md`,
      rss: true,
      image: false,
      article: {
        publishedTime: post.data.date,
        modifiedTime: post.data.date,
        authors: [post.data.author],
        section: "Engineering",
      },
    }),
  };
}
