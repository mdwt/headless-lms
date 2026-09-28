import type { Metadata } from "next";
import { siteConfig } from "@/lib/site";

type Options = {
  title: string;
  description: string;
  path: string;
  type?: "website" | "article";
  markdown?: string;
  rss?: boolean;
  article?: { publishedTime: string; modifiedTime?: string; authors: string[]; section?: string };
  /** `false` leaves the image to the segment's own opengraph-image file. */
  image?: string | false;
};

/**
 * Next replaces `openGraph` and `twitter` wholesale rather than merging them with
 * the root layout, so every page that sets either must restate siteName, locale
 * and the shared social image.
 */
export function pageMetadata(options: Options): Metadata {
  const {
    title,
    description,
    path,
    type = "website",
    markdown,
    rss,
    article,
    image = "/opengraph-image",
  } = options;
  const social = `${title} | ${siteConfig.name}`;
  const images = image === false ? {} : { images: [image] };
  const types: NonNullable<NonNullable<Metadata["alternates"]>["types"]> = {};
  if (markdown) {
    types["text/markdown"] = markdown;
  }
  if (rss) {
    types["application/rss+xml"] = [{ url: "/blog/rss.xml", title: `${siteConfig.name} Blog` }];
  }

  return {
    title,
    description,
    alternates: { canonical: path, types },
    openGraph: {
      title: social,
      description,
      url: path,
      type,
      siteName: siteConfig.name,
      locale: "en_US",
      ...images,
      ...(article ?? {}),
    },
    twitter: {
      card: "summary_large_image",
      site: siteConfig.twitterHandle,
      creator: siteConfig.twitterHandle,
      title: social,
      description,
      ...images,
    },
  };
}
