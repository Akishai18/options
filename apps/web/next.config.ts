import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  // Proxy API calls to the FastAPI backend during local dev so the browser
  // sees a single origin (no CORS), and we don't hardcode the API URL into
  // every fetch.
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${process.env.STRATLAB_API_URL ?? "http://localhost:8000"}/api/:path*`,
      },
    ];
  },
};

export default config;
