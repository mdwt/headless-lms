'use client';
// Media tracking entry — a dumb pipe between the host and media islands.
// No reporter, no timers, no LMS vocabulary; the host owns all policy.
import * as React from 'react';
import type { MediaTracking } from '@headless-lms/editor-contract';

const MediaTrackingContext = React.createContext<MediaTracking>({});

export function MediaProvider({
  onEvent,
  startPosition,
  refreshUrl,
  children,
}: MediaTracking & { children: React.ReactNode }) {
  const value = React.useMemo(
    () => ({ onEvent, startPosition, refreshUrl }),
    [onEvent, startPosition, refreshUrl],
  );
  return <MediaTrackingContext.Provider value={value}>{children}</MediaTrackingContext.Provider>;
}

/** Default {} — content rendered outside a provider plays and reports nothing. */
export function useMediaTracking(): MediaTracking {
  return React.useContext(MediaTrackingContext);
}

export type { MediaTracking, MediaTrackingEvent } from '@headless-lms/editor-contract';
