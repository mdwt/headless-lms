'use client';
// Vidstack island for the static video node. Emits media facts to the host's
// MediaTracking context; plays plain progressive sources (no hls.js). The
// resume/retry choreography lives in media-playback.ts, tested there.
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
import {
  captureError,
  consumeSeekSuppression,
  createResumeState,
  resumeTarget,
  videoMimeType,
} from './media-playback';

export function MediaVideoPlayer({
  assetId,
  url,
  name,
}: {
  assetId?: string;
  url: string;
  name?: string;
}) {
  const { onEvent, startPosition, refreshUrl } = useMediaTracking();
  const playerRef = React.useRef<MediaPlayerInstance>(null);
  const stateRef = React.useRef(createResumeState());
  const [src, setSrc] = React.useState(url);

  const duration = () => {
    const raw = playerRef.current?.duration;
    return typeof raw === 'number' && Number.isFinite(raw) && raw > 0 ? raw : null;
  };
  const emit = (kind: MediaTrackingEvent['kind'], seconds: number) => {
    if (!assetId || !onEvent) return;
    onEvent({ assetId, kind, seconds, duration: duration() });
  };

  return (
    <MediaPlayer
      ref={playerRef}
      className="overflow-hidden rounded-sm"
      src={{ src, type: videoMimeType(name) }}
      playsInline
      onCanPlay={() => {
        const saved = assetId ? startPosition?.(assetId) : undefined;
        const { target, next } = resumeTarget(stateRef.current, saved, duration());
        stateRef.current = next;
        if (target != null && playerRef.current) {
          playerRef.current.currentTime = target;
        }
      }}
      onPlay={() => emit('play', playerRef.current?.currentTime ?? 0)}
      onPause={() => emit('pause', playerRef.current?.currentTime ?? 0)}
      onSeeked={() => {
        const { report, next } = consumeSeekSuppression(stateRef.current);
        stateRef.current = next;
        if (report) {
          emit('seeked', playerRef.current?.currentTime ?? 0);
        }
      }}
      onEnded={() => emit('ended', playerRef.current?.duration ?? 0)}
      onTimeUpdate={(detail: MediaTimeUpdateEventDetail) => emit('timeupdate', detail.currentTime)}
      onError={() => {
        const { retry, next } = captureError(stateRef.current, playerRef.current?.currentTime);
        stateRef.current = next;
        if (retry && assetId && refreshUrl) {
          void refreshUrl(assetId)
            .then((fresh) => {
              if (fresh) setSrc(fresh);
            })
            .catch(() => {});
        }
      }}
    >
      <VidstackMediaProvider />
      <DefaultVideoLayout icons={defaultLayoutIcons} />
    </MediaPlayer>
  );
}
