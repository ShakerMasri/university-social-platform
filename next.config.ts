import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Preserve the project's owner-supplied repository instructions.
  agentRules: false,
  poweredByHeader: false,
};

export default nextConfig;
