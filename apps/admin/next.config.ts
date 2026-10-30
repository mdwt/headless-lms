import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Admin dashboard for the headless LMS — back-office surface.
  // The SDK and the installed editor ship TypeScript source from the
  // workspace, so Next must transpile them (this also keeps the editor's
  // 'use client' directives intact).
  transpilePackages: ["@headless-lms/sdk", "@headless-lms/editor", "@headless-lms/content-plate"],
  // pino resolves transports at runtime; bundling it breaks that.
  serverExternalPackages: ["pino"],
  // Dev-only: each server-side fetch is logged, so an API call and the line it
  // produced sit together.
  logging: { fetches: { fullUrl: true } },
};

export default nextConfig;
