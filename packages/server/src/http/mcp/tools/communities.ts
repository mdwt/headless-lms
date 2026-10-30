import {
  CommunitiesQuery,
  CommunityIdParam,
  CommunitySpaceParam,
  CreateCommunity,
  CreateSpace,
  OrderedIds,
  PatchDmSettings,
  SetSpaceTopics,
  SpaceLinkBody,
  SpaceLinkParam,
  UpdateCommunity,
  UpdateSpace,
} from '../../schemas/index.js';
import { actor, defineTool, type Tool } from '../tool.js';

export const communityTools: Tool[] = [
  defineTool({
    name: 'list_communities',
    title: 'List communities',
    description:
      'Search and page through the communities, drafts included, each with its status and direct-message settings. Filter by status, search by title.',
    scope: 'communities:read',
    kind: 'read',
    idempotent: true,
    openWorld: false,
    input: CommunitiesQuery,
    call: (input, { container, scope }) => container.content.listCommunities(scope.orgId, input),
  }),
  defineTool({
    name: 'list_spaces',
    title: 'List spaces',
    description:
      'The spaces of a community, in order, each with its access rule, topics and links.',
    scope: 'communities:read',
    kind: 'read',
    idempotent: true,
    openWorld: false,
    input: CommunityIdParam,
    call: ({ communityId }, { container, scope }) =>
      container.content.listSpaces(scope.orgId, communityId),
  }),
  defineTool({
    name: 'create_community',
    title: 'Create community',
    description:
      'Create a draft community with the default direct-message settings and no spaces. Add spaces with create_space and publish it with update_community.',
    scope: 'communities:write',
    kind: 'write',
    idempotent: false,
    openWorld: false,
    input: CreateCommunity,
    call: (input, { container, scope }) =>
      container.content.createCommunity(scope.orgId, input, actor(scope)),
  }),
  defineTool({
    name: 'update_community',
    title: 'Update community',
    description:
      'Change a community title, description or cover image, or publish and unpublish it with status. The cover must be a ready image from list_media; null clears it. Fields left out stay as they are.',
    scope: 'communities:write',
    kind: 'write',
    idempotent: true,
    openWorld: false,
    input: UpdateCommunity.extend(CommunityIdParam.shape),
    call: ({ communityId, ...input }, { container, scope }) =>
      container.content.updateCommunity(scope.orgId, communityId, input, actor(scope)),
  }),
  defineTool({
    name: 'update_community_messaging',
    title: 'Update community messaging',
    description:
      'Change the direct-message settings of a community: who may message whom from now on. Settings left out stay as they are.',
    scope: 'communities:write',
    kind: 'write',
    idempotent: true,
    openWorld: false,
    input: PatchDmSettings.extend(CommunityIdParam.shape),
    call: ({ communityId, ...input }, { container, scope }) =>
      container.content.patchDmSettings(scope.orgId, communityId, input, actor(scope)),
  }),
  defineTool({
    name: 'create_space',
    title: 'Create space',
    description:
      'Add a space at the end of a community. Its access rule decides who can open it: all members, by request or by invite. A space open to all members cannot have a capacity.',
    scope: 'communities:write',
    kind: 'write',
    idempotent: false,
    openWorld: false,
    input: CreateSpace.extend(CommunityIdParam.shape),
    call: ({ communityId, ...input }, { container, scope }) =>
      container.content.createSpace(scope.orgId, communityId, input, actor(scope)),
  }),
  defineTool({
    name: 'update_space',
    title: 'Update space',
    description:
      'Change a space name, description, access rule, capacity or settings. settings merges into the current settings. Fields left out stay as they are.',
    scope: 'communities:write',
    kind: 'write',
    idempotent: true,
    openWorld: false,
    input: UpdateSpace.extend(CommunitySpaceParam.shape),
    call: ({ communityId, spaceId, ...input }, { container, scope }) =>
      container.content.updateSpace(scope.orgId, communityId, spaceId, input, actor(scope)),
  }),
  defineTool({
    name: 'reorder_spaces',
    title: 'Reorder spaces',
    description:
      'Set the space order of a community. Pass every space id of the community in the new order.',
    scope: 'communities:write',
    kind: 'write',
    idempotent: true,
    openWorld: false,
    input: OrderedIds.extend(CommunityIdParam.shape),
    call: ({ communityId, ids }, { container, scope }) =>
      container.content.reorderSpaces(scope.orgId, communityId, ids, actor(scope)),
  }),
  defineTool({
    name: 'set_space_topics',
    title: 'Set space topics',
    description:
      'Replace the topics of a space. An entry with an id keeps and renames that topic, one without adds a topic, and a topic left out is deleted. A topic that posts use cannot be deleted.',
    scope: 'communities:write',
    kind: 'write',
    idempotent: true,
    openWorld: false,
    input: SetSpaceTopics.extend(CommunitySpaceParam.shape),
    call: ({ communityId, spaceId, ...input }, { container, scope }) =>
      container.content.setSpaceTopics(scope.orgId, communityId, spaceId, input, actor(scope)),
  }),
  defineTool({
    name: 'add_space_link',
    title: 'Add space link',
    description:
      'Link a course, download or community into a space, after its other links. Returns the space.',
    scope: 'communities:write',
    kind: 'write',
    idempotent: false,
    openWorld: false,
    input: SpaceLinkBody.extend(CommunitySpaceParam.shape),
    call: ({ communityId, spaceId, contentId }, { container, scope }) =>
      container.content.addSpaceLink(scope.orgId, communityId, spaceId, contentId, actor(scope)),
  }),
  defineTool({
    name: 'reorder_space_links',
    title: 'Reorder space links',
    description: 'Set the link order of a space. Pass every link id of the space in the new order.',
    scope: 'communities:write',
    kind: 'write',
    idempotent: true,
    openWorld: false,
    input: OrderedIds.extend(CommunitySpaceParam.shape),
    call: ({ communityId, spaceId, ids }, { container, scope }) =>
      container.content.reorderSpaceLinks(scope.orgId, communityId, spaceId, ids, actor(scope)),
  }),
  defineTool({
    name: 'remove_space_link',
    title: 'Remove space link',
    description:
      'Take a link out of a space. The linked content itself is kept. Returns the space.',
    scope: 'communities:write',
    kind: 'destructive',
    idempotent: true,
    openWorld: false,
    input: SpaceLinkParam,
    call: ({ communityId, spaceId, linkId }, { container, scope }) =>
      container.content.removeSpaceLink(scope.orgId, communityId, spaceId, linkId, actor(scope)),
  }),
  defineTool({
    name: 'delete_space',
    title: 'Delete space',
    description: 'Permanently delete a space with its posts, comments and members.',
    scope: 'communities:delete',
    kind: 'destructive',
    idempotent: true,
    openWorld: false,
    input: CommunitySpaceParam,
    call: ({ communityId, spaceId }, { container, scope }) =>
      container.content.deleteSpace(scope.orgId, communityId, spaceId, actor(scope)),
  }),
  defineTool({
    name: 'delete_community',
    title: 'Delete community',
    description:
      'Permanently delete a community with its spaces. Links to it from other spaces are removed.',
    scope: 'communities:delete',
    kind: 'destructive',
    idempotent: true,
    openWorld: false,
    input: CommunityIdParam,
    call: ({ communityId }, { container, scope }) =>
      container.content.deleteCommunity(scope.orgId, communityId, actor(scope)),
  }),
  defineTool({
    name: 'get_community_analytics',
    title: 'Get community analytics',
    description: 'Membership, activity and moderation counts for one community.',
    scope: 'analytics:read',
    kind: 'read',
    idempotent: true,
    openWorld: false,
    input: CommunityIdParam,
    call: ({ communityId }, { container, scope }) =>
      container.reporting.admin.communityAnalytics(scope.orgId, communityId),
  }),
];
