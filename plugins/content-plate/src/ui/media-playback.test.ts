import { describe, expect, it } from 'vitest';

import {
  captureError,
  consumeSeekSuppression,
  createResumeState,
  resumeTarget,
  videoMimeType,
} from './media-playback';

describe('resume choreography', () => {
  it('fresh load with a saved position seeks there and suppresses the seek report', () => {
    const { target, next } = resumeTarget(createResumeState(), 612, 1475);
    expect(target).toBe(612);
    expect(next.resumed).toBe(true);
    const seek = consumeSeekSuppression(next);
    expect(seek.report).toBe(false);
    expect(consumeSeekSuppression(seek.next).report).toBe(true); // user seeks still report
  });

  it('fresh load with an expired first presign still resumes at the saved position', () => {
    let st = createResumeState();
    const err = captureError(st, 0); // nothing played yet
    expect(err.retry).toBe(true);
    st = err.next;
    expect(st.resumeAt).toBeNull();
    const { target } = resumeTarget(st, 612, 1475);
    expect(target).toBe(612);
  });

  it('mid-playback expiry resumes at the interrupted position, not the saved one', () => {
    let st = resumeTarget(createResumeState(), 612, 1475).next;
    const err = captureError(st, 300);
    expect(err.retry).toBe(true);
    st = err.next;
    const { target } = resumeTarget(st, 612, 1475);
    expect(target).toBe(300);
  });

  it('retries the refresh only once', () => {
    const first = captureError(createResumeState(), 10);
    expect(first.retry).toBe(true);
    expect(captureError(first.next, 20).retry).toBe(false);
  });

  it('no saved position: no seek, no suppression', () => {
    const { target, next } = resumeTarget(createResumeState(), undefined, 90);
    expect(target).toBeNull();
    expect(consumeSeekSuppression(next).report).toBe(true);
  });

  it('a finished video restarts from the top', () => {
    const { target } = resumeTarget(createResumeState(), 89.6, 90);
    expect(target).toBeNull();
  });

  it('lesson revisits after the first load do not re-consult the saved position', () => {
    const st = resumeTarget(createResumeState(), 612, 1475).next;
    const { target } = resumeTarget(st, 612, 1475);
    expect(target).toBeNull();
  });
});

describe('videoMimeType', () => {
  it('derives the type from the stored filename', () => {
    expect(videoMimeType('clip.webm')).toBe('video/webm');
    expect(videoMimeType('clip.OGV')).toBe('video/ogg');
    expect(videoMimeType('clip.mp4')).toBe('video/mp4');
  });

  it('defaults to mp4 when the name is absent or unknown', () => {
    expect(videoMimeType(undefined)).toBe('video/mp4');
    expect(videoMimeType('clip.xyz')).toBe('video/mp4');
  });
});
