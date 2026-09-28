"use client";
// Media tracking entry — a dumb pipe between the host and media islands.
// No reporter, no timers, no LMS vocabulary; the host owns all policy.
import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { MediaTracking } from "@headless-lms/editor";

const MediaTrackingContext = createContext<MediaTracking>({});

export function MediaProvider({
  onEvent,
  startPosition,
  refreshUrl,
  children,
}: MediaTracking & { children: ReactNode }) {
  const value = useMemo(
    () => ({ onEvent, startPosition, refreshUrl }),
    [onEvent, startPosition, refreshUrl],
  );
  return <MediaTrackingContext.Provider value={value}>{children}</MediaTrackingContext.Provider>;
}

/** Default {} — content rendered outside a provider plays and reports nothing. */
export function useMediaTracking(): MediaTracking {
  return useContext(MediaTrackingContext);
}

export type { MediaTracking, MediaTrackingEvent } from "@headless-lms/editor";
