import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@avenire/ai",
    "@avenire/auth",
    "@avenire/client-runtime",
    "@avenire/cloud",
    "@avenire/contracts",
    "@avenire/database",
    "@avenire/desktop",
    "@avenire/emailer",
    "@avenire/ingestion",
    "@avenire/shared",
    "@avenire/storage",
    "@avenire/ui",
  ],
  typescript: { ignoreBuildErrors: true },
};

export default nextConfig;
