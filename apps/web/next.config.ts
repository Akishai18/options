import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

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

// Sentry options. We don't ship the SDK to the browser if the DSN isn't set —
// withSentryConfig still runs but Sentry.init() in sentry.client.config.ts is
// a no-op without a DSN. Source map upload is skipped without an org/project.
export default withSentryConfig(config, {
  silent: true,
  // The SENTRY_AUTH_TOKEN env var is set in CI/Vercel for source-map upload.
  // Without it, builds still succeed; you just don't get symbolicated stack
  // traces in Sentry.
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  // Tunnel through our own domain so privacy-respecting ad-blockers don't
  // strip out the Sentry envelope.
  tunnelRoute: "/monitoring",
  // Strip the SDK's own console logs from the production bundle.
  disableLogger: true,
  // Don't expose the source maps to the browser; Sentry still gets them via auth token.
  sourcemaps: { disable: false, deleteSourcemapsAfterUpload: true },
});
