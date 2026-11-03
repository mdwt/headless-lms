import { z } from 'zod';
import { idSchema } from '../types/schemas/index.js';
import type { Logger, RecurringJob, ScheduledJob } from '../shared/ports.js';
import { noopLogger } from '../shared/logger.js';
import type { PostService } from './ports.js';

export const POST_PUBLISH_JOB = 'discussion.post.publish';

const postPublishPayload = z.object({ orgId: idSchema, postId: idSchema }).strict();

export interface DiscussionJobDeps {
  posts: Pick<PostService, 'publishScheduled'>;
  logger?: Logger;
}

export function discussionJobs(deps: DiscussionJobDeps): ScheduledJob[] {
  const logger = deps.logger ?? noopLogger;
  return [
    {
      job: POST_PUBLISH_JOB,
      async run(payload, fire) {
        const parsed = postPublishPayload.safeParse(payload);
        if (!parsed.success) {
          logger.error('scheduled post payload refused', {
            job: POST_PUBLISH_JOB,
            fireId: fire.id,
          });
          return;
        }
        await deps.posts.publishScheduled(parsed.data.orgId, parsed.data.postId, fire.startedAt);
      },
    },
  ];
}

export const discussionRecurringJobs: RecurringJob[] = [];
