import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@headless-lms/sdk", "@headless-lms/editor", "@headless-lms/content-plate"],
};

export default nextConfig;
