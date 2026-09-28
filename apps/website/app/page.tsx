import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Hero } from "@/components/landing/hero";
import { Features } from "@/components/landing/features";
import { Architecture } from "@/components/landing/architecture";
import { AppsMcp } from "@/components/landing/apps-mcp";
import { Cta } from "@/components/landing/cta";
import { absoluteUrl, siteConfig } from "@/lib/site";
import { jsonLdProps } from "@/lib/structured-data";

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "SoftwareApplication",
      "@id": absoluteUrl("/#software"),
      name: siteConfig.name,
      applicationCategory: "DeveloperApplication",
      applicationSubCategory: "Learning Management System",
      operatingSystem: "Any",
      url: siteConfig.url,
      description: siteConfig.description,
      license: "https://opensource.org/licenses/MIT",
      softwareHelp: absoluteUrl("/docs"),
      author: { "@id": absoluteUrl("/#organization") },
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
      },
    },
    {
      "@type": "SoftwareSourceCode",
      "@id": `${siteConfig.githubUrl}#source`,
      name: siteConfig.name,
      description: siteConfig.description,
      codeRepository: siteConfig.githubUrl,
      programmingLanguage: "TypeScript",
      runtimePlatform: "Node.js",
      license: "https://opensource.org/licenses/MIT",
    },
  ],
};

export default function HomePage() {
  return (
    <div className="isolate flex min-h-dvh flex-col">
      <script {...jsonLdProps(jsonLd)} />
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[60] focus:rounded-md focus:border focus:border-border focus:bg-background focus:px-3 focus:py-2 focus:text-sm"
      >
        Skip to content
      </a>
      <SiteHeader />
      <main id="main-content" className="flex-1">
        <Hero />
        <Features />
        <AppsMcp />
        <Architecture />

        <Cta />
      </main>
      <SiteFooter />
    </div>
  );
}
