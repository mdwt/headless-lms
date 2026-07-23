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
          background: "#fafafa",
          color: "#171717",
        }}
      >
        <h1 style={{ margin: 0, fontSize: "18px", fontWeight: 600 }}>
          Something went wrong
        </h1>
        <p style={{ margin: 0, maxWidth: "42ch", fontSize: "14px", color: "#636363" }}>
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
            background: "#171717",
            color: "#fff",
            cursor: "pointer",
          }}
        >
          Try again
        </button>
        {error.digest ? (
          <p style={{ margin: 0, fontSize: "12px", fontFamily: "ui-monospace, monospace", color: "#a3a3a3" }}>
            ref: {error.digest}
          </p>
        ) : null}
      </body>
    </html>
  );
}
