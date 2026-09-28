import { createMDX } from "fumadocs-mdx/next";

const withMDX = createMDX();

const canonicalHost = "headless-lms.dev";
const redirectHosts = ["www.headless-lms.dev", "headless-lms.com", "www.headless-lms.com"];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      { source: "/docs/:slug*.md", destination: "/md/docs/:slug*" },
      { source: "/blog/:slug.md", destination: "/md/blog/:slug" },
      { source: "/changelog.md", destination: "/md/changelog" },
    ];
  },
  async redirects() {
    return redirectHosts.map((host) => ({
      source: "/:path*",
      has: [{ type: "host", value: host }],
      destination: `https://${canonicalHost}/:path*`,
      permanent: true,
    }));
  },
};

export default withMDX(nextConfig);
