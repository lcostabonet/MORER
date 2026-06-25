import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  eslint: {
    // ESLint runs separately in CI; skip during build to avoid
    // the eslint-config-next circular-JSON serialisation bug.
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
