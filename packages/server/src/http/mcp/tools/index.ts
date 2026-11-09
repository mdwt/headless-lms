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

export const TOOL_GROUPS: { title: string; tools: Tool[] }[] = [
  { title: 'Courses', tools: courseTools },
  { title: 'Downloads, bundles and media', tools: catalogTools },
  { title: 'Events', tools: eventTools },
  { title: 'Students, access and analytics', tools: peopleTools },
  { title: 'Organization, roles and team', tools: organizationTools },
  { title: 'Workflows and webhooks', tools: automationTools },
  { title: 'Comments', tools: commentTools },
  { title: 'Communities', tools: communityTools },
  { title: 'Community members', tools: communityMemberTools },
  { title: 'Community moderation', tools: communityModerationTools },
];

export const TOOLS: Tool[] = TOOL_GROUPS.flatMap((group) => group.tools);
