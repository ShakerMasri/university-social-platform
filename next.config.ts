import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Preserve the project's owner-supplied repository instructions.
  agentRules: false,
  poweredByHeader: false,
  // Request URLs can contain private identifiers or verification inputs. Keep
  // development request/fetch logs off; fixed application failure events remain.
  logging: false,
  // No image optimization is used by the current application.
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
