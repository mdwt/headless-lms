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
          background: "#faf9f6",
          color: "#1b1b19",
        }}
      >
        <h1 style={{ margin: 0, fontSize: "18px", fontWeight: 600 }}>
          Something went wrong
        </h1>
        <p style={{ margin: 0, maxWidth: "42ch", fontSize: "14px", color: "#6f6d66" }}>
          The app couldn&apos;t be loaded. Try again, or reload the page.
        </p>
        <button
          onClick={reset}
          style={{
            marginTop: "4px",
            padding: "9px 18px",
            fontSize: "13.5px",
            fontWeight: 600,
            borderRadius: "999px",
            border: "none",
            background: "#1b1b19",
            color: "#fff",
            cursor: "pointer",
          }}
        >
          Try again
        </button>
        {error.digest ? (
          <p style={{ margin: 0, fontSize: "12px", fontFamily: "ui-monospace, monospace", color: "#a3a097" }}>
            ref: {error.digest}
          </p>
        ) : null}
      </body>
    </html>
  );
}
