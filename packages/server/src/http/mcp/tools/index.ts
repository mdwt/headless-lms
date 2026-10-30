import type { Tool } from '../tool.js';
import { automationTools } from './automations.js';
import { catalogTools } from './catalog.js';
import { commentTools } from './comments.js';
import { communityMemberTools } from './community-members.js';
import { communityModerationTools } from './community-moderation.js';
import { communityTools } from './communities.js';
import { courseTools } from './courses.js';
import { peopleTools } from './people.js';

export const TOOLS: Tool[] = [
  ...courseTools,
  ...catalogTools,
  ...peopleTools,
  ...automationTools,
  ...commentTools,
  ...communityTools,
  ...communityMemberTools,
  ...communityModerationTools,
];
