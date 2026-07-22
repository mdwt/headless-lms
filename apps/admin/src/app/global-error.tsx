"use client";

// Last-resort boundary — only reached when the root *layout* itself throws.
// It replaces the entire document, so global styles and fonts are gone: keep it
// dependency-free and inline-styled so it can never fail on the same code that
// just crashed.
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("global error:", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "12px",
          padding: "24px",
          textAlign: "center",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
          background: "#fff",
          color: "#1a1a1a",
        }}
      >
        <h1 style={{ margin: 0, fontSize: "16px", fontWeight: 500 }}>
          Something went wrong
        </h1>
        <p style={{ margin: 0, maxWidth: "42ch", fontSize: "14px", color: "#6b6b6b" }}>
          The app couldn&apos;t be loaded. Try again, or reload the page.
        </p>
        <button
          onClick={reset}
          style={{
            marginTop: "4px",
            padding: "8px 16px",
            fontSize: "14px",
            fontWeight: 500,
            borderRadius: "8px",
            border: "1px solid #d4d4d4",
            background: "#1a1a1a",
            color: "#fff",
            cursor: "pointer",
          }}
        >
          Try again
        </button>
        {error.digest ? (
          <p style={{ margin: 0, fontSize: "12px", fontFamily: "ui-monospace, monospace", color: "#9a9a9a" }}>
            ref: {error.digest}
          </p>
        ) : null}
      </body>
    </html>
  );
}
