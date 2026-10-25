import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Set only in the optional QA build/server child, never in ordinary scripts.
  ...(process.env.USP_MANUAL_BUILD === "1" ? {
    distDir: ".next-manual", typescript: { tsconfigPath: "tsconfig.manual.json" },
  } : {}),
  // Preserve the project's owner-supplied repository instructions.
  agentRules: false,
  poweredByHeader: false,
  // No image optimization is used by the current application.
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
