import { statSync } from "node:fs";
import type { MetadataRoute } from "next";
import { blogEntries, changelogEntries, docsEntries } from "@/lib/llms";
import { absoluteUrl } from "@/lib/site";

function lastModified(file: string) {
  try {
    return statSync(file).mtime;
  } catch {
    return undefined;
  }
}

export default function sitemap(): MetadataRoute.Sitemap {
  const docs = docsEntries().map((entry) => ({
    url: absoluteUrl(entry.url),
    lastModified: lastModified(entry.file),
    changeFrequency: "weekly" as const,
    priority: entry.url === "/docs" ? 0.9 : 0.8,
  }));

  const posts = blogEntries().map((entry) => ({
    url: absoluteUrl(entry.url),
    lastModified: lastModified(entry.file),
    changeFrequency: "monthly" as const,
    priority: 0.7,
  }));

  const changelogUpdated = changelogEntries()
    .map((entry) => lastModified(entry.file))
    .filter((date): date is Date => date !== undefined)
    .sort((a, b) => b.getTime() - a.getTime())[0];

  return [
    {
      url: absoluteUrl("/"),
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: absoluteUrl("/blog"),
      lastModified: posts[0]?.lastModified,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: absoluteUrl("/changelog"),
      lastModified: changelogUpdated,
      changeFrequency: "weekly",
      priority: 0.7,
    },
    ...docs,
    ...posts,
  ];
}
