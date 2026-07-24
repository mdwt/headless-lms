import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { EditorMediaModule, MediaTracking } from '@headless-lms/editor-contract';

import { MediaProvider, useMediaTracking } from './index';

describe('media entry', () => {
  it('satisfies the EditorMediaModule contract', () => {
    const module: EditorMediaModule = { MediaProvider };
    expect(typeof module.MediaProvider).toBe('function');
    expect(typeof useMediaTracking).toBe('function');
  });

  it('passes callbacks and props through the provider', () => {
    let seen: MediaTracking | undefined;
    function Probe() {
      seen = useMediaTracking();
      return null;
    }
    const onEvent = () => {};
    const startPosition = () => 42;
    const refreshUrl = async () => 'https://example.com/refresh';
    renderToString(
      <MediaProvider onEvent={onEvent} startPosition={startPosition} refreshUrl={refreshUrl}>
        <Probe />
      </MediaProvider>,
    );
    expect(seen?.onEvent).toBe(onEvent);
    expect(seen?.startPosition).toBe(startPosition);
    expect(seen?.refreshUrl).toBe(refreshUrl);
  });

  it('defaults to {} outside a provider', () => {
    let seen: MediaTracking | undefined;
    function Probe() {
      seen = useMediaTracking();
      return null;
    }
    renderToString(<Probe />);
    expect(seen).toEqual({});
  });
});
