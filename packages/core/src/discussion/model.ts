// discussion context — domain entities, owned by @headless-lms/core/types.
export type {
  ActivityCommentsRule,
  Comment,
  CommentAuthor,
  CommentStatus,
  CommentReaction,
  CommentReport,
  CommentSettings,
} from '../types/index.js';

export class InvalidCursorError extends Error {
  constructor(readonly cursor: string) {
    super('The feed cursor is not one this feed returned');
    this.name = 'InvalidCursorError';
  }
}
