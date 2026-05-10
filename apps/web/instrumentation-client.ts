/* Sentry — client (browser) side. Loaded by Next instrumentation. */

import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN_FRONTEND;

if (dsn) {
  Sentry.init({
    dsn,
    // Errors only — no perf traces in V1 (the plan §9 explicitly defers this).
    tracesSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    replaysSessionSampleRate: 0,
    // Strip query strings from breadcrumbs in case anyone ever passes a token in a URL.
    beforeBreadcrumb(crumb) {
      if (crumb.data?.url && typeof crumb.data.url === "string") {
        crumb.data.url = crumb.data.url.split("?")[0];
      }
      return crumb;
    },
  });
}
