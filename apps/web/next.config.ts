import type { NextConfig } from 'next';

// The browser only ever talks to THIS website. Anything starting with /api
// is quietly forwarded to the Express server (same address = safe cookies, no CORS).
const API_URL = process.env.API_URL ?? 'http://localhost:4000';

const nextConfig: NextConfig = {
  transpilePackages: ['@harvestgo/shared'],
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${API_URL}/api/:path*` }];
  },
};

export default nextConfig;
