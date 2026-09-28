import { absoluteUrl, siteConfig } from "@/lib/site";

const organizationId = absoluteUrl("/#organization");
const websiteId = absoluteUrl("/#website");

export const organization = {
  "@type": "Organization",
  "@id": organizationId,
  name: siteConfig.name,
  url: siteConfig.url,
  description: siteConfig.description,
  logo: absoluteUrl("/icon.svg"),
  sameAs: [siteConfig.githubUrl, `https://x.com/${siteConfig.twitterHandle.replace("@", "")}`],
};

export const website = {
  "@type": "WebSite",
  "@id": websiteId,
  name: siteConfig.name,
  url: siteConfig.url,
  description: siteConfig.description,
  inLanguage: "en",
  publisher: { "@id": organizationId },
  potentialAction: {
    "@type": "SearchAction",
    target: {
      "@type": "EntryPoint",
      urlTemplate: absoluteUrl("/docs?q={search_term_string}"),
    },
    "query-input": "required name=search_term_string",
  },
};

export const siteGraph = { "@context": "https://schema.org", "@graph": [organization, website] };

export function breadcrumbs(trail: { name: string; url: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.url),
    })),
  };
}

export function jsonLdProps(data: unknown) {
  return {
    type: "application/ld+json",
    dangerouslySetInnerHTML: { __html: JSON.stringify(data) },
  } as const;
}
