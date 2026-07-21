import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Admin dashboard for the headless LMS — back-office surface.
  // The SDK, the editor contract, and the installed editor ship TypeScript
  // source from the workspace, so Next must transpile them (this also keeps
  // the editor's 'use client' directives intact).
  transpilePackages: [
    "@headless-lms/sdk",
    "@headless-lms/editor-contract",
    "@headless-lms/content-plate",
  ],
};

export default nextConfig;
