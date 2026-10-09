import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Preserve the project's owner-supplied repository instructions.
  agentRules: false,
  poweredByHeader: false,
  // No image optimization is used by the current application.
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
