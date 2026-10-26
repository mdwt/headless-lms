// Pure playback logic for the video island: resume choreography and
// source typing. Free of React and Vidstack so it unit-tests in plain node.

export interface ResumeState {
  /** First-load resume consumed. */
  resumed: boolean;
  /** The next seeked event is a programmatic resume, not a usage fact. */
  suppressSeekReport: boolean;
}

export function createResumeState(): ResumeState {
  return { resumed: false, suppressSeekReport: false };
}

/** Seek target when the media becomes ready: the host's saved position on the
 *  first load; a finished video restarts from the top. */
export function resumeTarget(
  st: ResumeState,
  saved: number | undefined,
  duration: number | null,
): { target: number | null; next: ResumeState } {
  let candidate: number | null = null;
  if (!st.resumed) {
    const finished = saved != null && duration != null && duration > 0 && saved >= duration - 1;
    candidate = finished ? null : (saved ?? null);
  }
  const target = candidate != null && candidate > 0 ? candidate : null;
  return {
    target,
    next: {
      ...st,
      resumed: true,
      suppressSeekReport: st.suppressSeekReport || target != null,
    },
  };
}

/** Whether a seeked event is a real usage fact; consumes the one-shot flag. */
export function consumeSeekSuppression(st: ResumeState): {
  report: boolean;
  next: ResumeState;
} {
  if (!st.suppressSeekReport) {
    return { report: true, next: st };
  }
  return { report: false, next: { ...st, suppressSeekReport: false } };
}

/** The subset of Vidstack's closed VideoMimeType union we can produce. */
export type VideoMime = "video/mp4" | "video/webm" | "video/ogg";

const VIDEO_MIME: Record<string, VideoMime> = {
  m4v: "video/mp4",
  mov: "video/mp4", // quicktime isn't in Vidstack's union; browsers sniff the container
  mp4: "video/mp4",
  ogg: "video/ogg",
  ogv: "video/ogg",
  webm: "video/webm",
};

/** Presigned URLs bury the extension behind the signature query, so the source
 *  type derives from the stored filename; mp4 is the upload default. */
export function videoMimeType(name: string | undefined): VideoMime {
  const ext = name?.split(".").pop()?.toLowerCase() ?? "";
  return VIDEO_MIME[ext] ?? "video/mp4";
}
