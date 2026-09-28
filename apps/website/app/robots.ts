import type { MetadataRoute } from "next";
import { aiCrawlers } from "@/lib/crawlers";
import { absoluteUrl, siteConfig } from "@/lib/site";

const disallow = ["/api/"];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow },
      ...aiCrawlers.map((userAgent) => ({ userAgent, allow: "/", disallow })),
    ],
    sitemap: absoluteUrl("/sitemap.xml"),
    host: siteConfig.url,
  };
}
