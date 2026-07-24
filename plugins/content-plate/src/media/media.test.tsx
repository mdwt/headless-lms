import { describe, expect, it } from 'vitest';
import type { EditorMediaModule } from '@headless-lms/editor-contract';

import { MediaProvider, useMediaTracking } from './index';

describe('media entry', () => {
  it('satisfies the EditorMediaModule contract', () => {
    const module: EditorMediaModule = { MediaProvider };
    expect(typeof module.MediaProvider).toBe('function');
    expect(typeof useMediaTracking).toBe('function');
  });
});
