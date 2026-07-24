'use client';
// Vidstack island for the static video node. Emits media facts to the host's
// MediaTracking context; plays plain progressive sources (no hls.js).
import * as React from 'react';
import {
  MediaPlayer,
  MediaProvider as VidstackMediaProvider,
  type MediaPlayerInstance,
  type MediaTimeUpdateEventDetail,
} from '@vidstack/react';
import {
  DefaultVideoLayout,
  defaultLayoutIcons,
} from '@vidstack/react/player/layouts/default';
import '@vidstack/react/player/styles/default/theme.css';
import '@vidstack/react/player/styles/default/layouts/video.css';

import { useMediaTracking, type MediaTrackingEvent } from '../media';

export function MediaVideoPlayer({ assetId, url }: { assetId?: string; url: string }) {
  const { onEvent, startPosition, refreshUrl } = useMediaTracking();
  const playerRef = React.useRef<MediaPlayerInstance>(null);
  const [src, setSrc] = React.useState(url);
  const resumedRef = React.useRef(false);
  const retriedRef = React.useRef(false);
  const resumeAtRef = React.useRef<number | null>(null);

  const emit = (kind: MediaTrackingEvent['kind'], seconds: number) => {
    if (!assetId || !onEvent) return;
    const raw = playerRef.current?.duration;
    onEvent({
      assetId,
      kind,
      seconds,
      duration: typeof raw === 'number' && Number.isFinite(raw) && raw > 0 ? raw : null,
    });
  };

  return (
    <MediaPlayer
      ref={playerRef}
      src={{ src, type: 'video/mp4' }}
      playsInline
      onCanPlay={() => {
        // After an expiry reload, resume where playback stopped; on first
        // load, at the host's stored position.
        const target =
          resumeAtRef.current ??
          (!resumedRef.current && assetId ? (startPosition?.(assetId) ?? null) : null);
        resumedRef.current = true;
        resumeAtRef.current = null;
        if (target && playerRef.current) playerRef.current.currentTime = target;
      }}
      onPlay={() => emit('play', playerRef.current?.currentTime ?? 0)}
      onPause={() => emit('pause', playerRef.current?.currentTime ?? 0)}
      onSeeked={() => emit('seeked', playerRef.current?.currentTime ?? 0)}
      onEnded={() => emit('ended', playerRef.current?.duration ?? 0)}
      onTimeUpdate={(detail: MediaTimeUpdateEventDetail) => emit('timeupdate', detail.currentTime)}
      onError={() => {
        if (retriedRef.current || !assetId || !refreshUrl) return;
        retriedRef.current = true;
        resumeAtRef.current = playerRef.current?.currentTime ?? null;
        void refreshUrl(assetId).then((fresh) => {
          if (fresh) setSrc(fresh);
        });
      }}
    >
      <VidstackMediaProvider />
      <DefaultVideoLayout icons={defaultLayoutIcons} />
    </MediaPlayer>
  );
}
