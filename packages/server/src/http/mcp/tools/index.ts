import type { Tool } from '../tool.js';
import { automationTools } from './automations.js';
import { catalogTools } from './catalog.js';
import { commentTools } from './comments.js';
import { communityMemberTools } from './community-members.js';
import { communityModerationTools } from './community-moderation.js';
import { communityTools } from './communities.js';
import { courseTools } from './courses.js';
import { eventTools } from './events.js';
import { peopleTools } from './people.js';
import { organizationTools } from './organization.js';

export const TOOLS: Tool[] = [
  ...courseTools,
  ...catalogTools,
  ...eventTools,
  ...peopleTools,
  ...organizationTools,
  ...automationTools,
  ...commentTools,
  ...communityTools,
  ...communityMemberTools,
  ...communityModerationTools,
];
