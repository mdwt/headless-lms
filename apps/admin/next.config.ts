import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Admin dashboard for the headless LMS — back-office surface.
  // The SDK ships TypeScript source from the workspace, so Next must transpile it.
  transpilePackages: ["@headless-lms/sdk"],
};

export default nextConfig;
