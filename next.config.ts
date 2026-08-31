import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Default is 1MB — too small for a menu PDF/photo upload
      // (src/server/actions/cardapio-import.ts), which arrives as a base64
      // string roughly ~1.35x the original file size.
      bodySizeLimit: "20mb",
    },
  },
};

export default nextConfig;
