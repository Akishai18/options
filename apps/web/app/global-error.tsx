"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

/* App Router global error boundary — required for Sentry to capture React
 * render errors in production. Renders a minimal HTML doc since Next won't
 * provide layout for this. */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html>
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          background: "oklch(0.145 0.005 60)",
          color: "oklch(0.93 0.005 60)",
          fontFamily: "ui-monospace, monospace",
          display: "grid",
          placeItems: "center",
          padding: "2rem",
        }}
      >
        <div style={{ maxWidth: 540, textAlign: "center" }}>
          <p
            style={{
              fontSize: 11,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "oklch(0.66 0.005 60)",
              marginBottom: 12,
            }}
          >
            something broke
          </p>
          <h1 style={{ fontSize: 22, fontWeight: 400, marginBottom: 16 }}>
            The workbench hit an unrecoverable error.
          </h1>
          <p style={{ fontSize: 13, color: "oklch(0.66 0.005 60)", marginBottom: 24 }}>
            We&apos;ve been notified. Try refreshing — if it persists, send us
            the timestamp{" "}
            <code style={{ color: "oklch(0.78 0.13 75)" }}>
              {new Date().toISOString()}
            </code>
            .
          </p>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              padding: "0.5rem 1rem",
              border: "1px solid oklch(0.78 0.13 75)",
              background: "transparent",
              color: "oklch(0.78 0.13 75)",
              fontFamily: "inherit",
              fontSize: 12,
              cursor: "pointer",
              borderRadius: 4,
            }}
          >
            try again
          </button>
        </div>
      </body>
    </html>
  );
}
