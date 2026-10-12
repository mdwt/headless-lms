import { describe, expect, it } from 'vitest';
import { CreateCourse, UpdateCourse } from './content.js';
import { CreateDownload, UpdateDownload } from './downloads.js';

describe('update schemas', () => {
  it('keep only the fields that were sent', () => {
    expect(UpdateCourse.parse({ status: 'published' })).toEqual({ status: 'published' });
    expect(UpdateDownload.parse({ status: 'published' })).toEqual({ status: 'published' });
  });

  it('still validate the fields they share with create', () => {
    expect(UpdateCourse.safeParse({ title: '' }).success).toBe(false);
    expect(UpdateDownload.safeParse({ title: '' }).success).toBe(false);
  });

  it('leave the create defaults in place', () => {
    expect(CreateCourse.parse({ title: 'Intro' })).toEqual({
      title: 'Intro',
      description: '',
      category: '',
    });
    expect(CreateDownload.parse({ title: 'Kit' })).toEqual({
      title: 'Kit',
      description: '',
      category: '',
    });
  });
});
