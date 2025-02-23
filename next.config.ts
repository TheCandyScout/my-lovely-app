import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactStrictMode: true,
  images: {
    unoptimized: true, // Disable default image optimization
  },
  assetPrefix: '/my-lovely-app/',
  basePath: '/my-lovely-app',
  output: 'export'
};

export default nextConfig;
