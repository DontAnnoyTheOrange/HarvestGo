import path from 'node:path';
import { loadEnvConfig } from '@next/env';
import type { NextConfig } from 'next';

// The API now runs INSIDE this Next.js app (app/api/[...path]/route.ts), so there is no
// second server and no rewrite. Locally, also read the .env in the project root.
loadEnvConfig(path.resolve(__dirname, '../..'));

const nextConfig: NextConfig = {
  transpilePackages: ['@harvestgo/shared'],
  // Keep Express and friends as normal Node modules instead of bundling them.
  serverExternalPackages: ['express', 'helmet', 'cookie-parser', 'express-rate-limit', 'dotenv'],
};

export default nextConfig;
