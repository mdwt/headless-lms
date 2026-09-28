import type { ReactNode } from "react";
import { Analytics } from "@vercel/analytics/next";
import type { Metadata, Viewport } from "next";
import { Figtree, Fredoka, JetBrains_Mono } from "next/font/google";
import { RootProvider } from "fumadocs-ui/provider/next";
import { siteConfig } from "@/lib/site";
import { jsonLdProps, siteGraph } from "@/lib/structured-data";
import "./globals.css";

const figtree = Figtree({
  subsets: ["latin"],
  variable: "--font-figtree",
});

const fredoka = Fredoka({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-fredoka",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
});

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  title: {
    default: `${siteConfig.name}: ${siteConfig.tagline}`,
    template: `%s | ${siteConfig.name}`,
  },
  description: siteConfig.description,
  applicationName: siteConfig.name,
  authors: [{ name: siteConfig.author, url: siteConfig.githubUrl }],
  creator: siteConfig.author,
  publisher: siteConfig.name,
  category: "technology",
  referrer: "origin-when-cross-origin",
  formatDetection: { telephone: false, address: false, email: false },
  keywords: [
    "headless LMS",
    "open source LMS",
    "LMS API",
    "learning management system",
    "TypeScript LMS",
    "API-first LMS",
    "self-hosted LMS",
  ],
  alternates: {
    canonical: "./",
    types: {
      "application/rss+xml": [{ url: "/blog/rss.xml", title: `${siteConfig.name} Blog` }],
    },
  },
  openGraph: {
    type: "website",
    siteName: siteConfig.name,
    url: siteConfig.url,
    title: `${siteConfig.name}: ${siteConfig.tagline}`,
    description: siteConfig.description,
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    site: siteConfig.twitterHandle,
    creator: siteConfig.twitterHandle,
    title: `${siteConfig.name}: ${siteConfig.tagline}`,
    description: siteConfig.description,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

export const viewport: Viewport = {
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8f9f3" },
    { media: "(prefers-color-scheme: dark)", color: "#15161a" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${figtree.variable} ${fredoka.variable} ${jetbrainsMono.variable}`}
      suppressHydrationWarning
    >
      <body className="bg-background font-sans antialiased">
        <script {...jsonLdProps(siteGraph)} />
        <RootProvider>{children}</RootProvider>
        {process.env.NODE_ENV === "production" && <Analytics />}
      </body>
    </html>
  );
}
