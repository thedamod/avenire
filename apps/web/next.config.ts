import { existsSync } from "node:fs";
import type { NextConfig } from "next";

// One env file for the monorepo: the repo-root .env.local (Next only reads apps/web/.env*).
const rootEnv = new URL("../../.env.local", import.meta.url);
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

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
