import type { NextConfig } from "next";

// Fully static export for GitHub Pages (served at the domain root, so no basePath).
const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  trailingSlash: true,
  reactStrictMode: true,
  poweredByHeader: false,
};

export default nextConfig;
