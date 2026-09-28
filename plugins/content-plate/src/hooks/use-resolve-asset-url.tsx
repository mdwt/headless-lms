"use client";

// Host-provided asset URL broker. Stored configs embed save-time presigns
// that expire; client media nodes resolve a fresh URL for their assetId on
// mount through this context. Without a handler (or without an assetId) nodes
// fall back to the embedded URL.

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

import type { ResolveAssetUrl } from "@headless-lms/editor";

const ResolveAssetUrlContext = createContext<ResolveAssetUrl | null>(null);

export function ResolveAssetUrlProvider({
  children,
  resolveAssetUrl,
}: {
  children: ReactNode;
  resolveAssetUrl: ResolveAssetUrl | null;
}) {
  return (
    <ResolveAssetUrlContext.Provider value={resolveAssetUrl}>
      {children}
    </ResolveAssetUrlContext.Provider>
  );
}

/** Displayable URL for a media element: the embedded one until (and unless)
 *  the host brokers a fresh presign for its assetId. */
export function useFreshMediaUrl(element: unknown): string | undefined {
  const resolve = useContext(ResolveAssetUrlContext);
  const el = (element ?? {}) as { assetId?: unknown; url?: unknown };
  const assetId = typeof el.assetId === "string" ? el.assetId : undefined;
  const stored = typeof el.url === "string" ? el.url : undefined;
  const [fresh, setFresh] = useState<string | null>(null);

  useEffect(() => {
    if (!assetId || !resolve) return;
    let alive = true;
    resolve(assetId)
      .then((url) => {
        if (alive && url) setFresh(url);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [assetId, resolve]);

  return fresh ?? stored;
}
