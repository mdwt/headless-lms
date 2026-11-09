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
import { defineTool, type Tool } from '../tool.js';

export const communityTools: Tool[] = [
  defineTool({
    name: 'list_communities',
    title: 'List communities',
    description:
      'Search and page through the communities, drafts included, each with its status and direct-message settings. Filter by status, search by title.',
    kind: 'read',
    idempotent: true,
    openWorld: false,
    input: CommunitiesQuery,
    call: (input, { container, caller }) => container.content.listCommunities(input, caller.actor),
  }),
  defineTool({
    name: 'list_spaces',
    title: 'List spaces',
    description:
      'The spaces of a community, in order, each with its access rule, topics and links.',
    kind: 'read',
    idempotent: true,
    openWorld: false,
    input: CommunityIdParam,
    call: ({ communityId }, { container, caller }) =>
      container.content.listSpaces(communityId, caller.actor),
  }),
  defineTool({
    name: 'create_community',
    title: 'Create community',
    description:
      'Create a draft community with the default direct-message settings and no spaces. Add spaces with create_space and publish it with update_community.',
    kind: 'write',
    idempotent: false,
    openWorld: false,
    input: CreateCommunity,
    call: (input, { container, caller }) => container.content.createCommunity(input, caller.actor),
  }),
  defineTool({
    name: 'update_community',
    title: 'Update community',
    description:
      'Change a community title, description or cover image, or publish and unpublish it with status. The cover must be a ready image from list_media; null clears it. Fields left out stay as they are.',
    kind: 'write',
    idempotent: true,
    openWorld: false,
    input: UpdateCommunity.extend(CommunityIdParam.shape),
    call: ({ communityId, ...input }, { container, caller }) =>
      container.content.updateCommunity(communityId, input, caller.actor),
  }),
  defineTool({
    name: 'update_community_messaging',
    title: 'Update community messaging',
    description:
      'Change the direct-message settings of a community: who may message whom from now on. Settings left out stay as they are.',
    kind: 'write',
    idempotent: true,
    openWorld: false,
    input: PatchDmSettings.extend(CommunityIdParam.shape),
    call: ({ communityId, ...input }, { container, caller }) =>
      container.content.patchCommunitySettings(communityId, input, caller.actor),
  }),
  defineTool({
    name: 'create_space',
    title: 'Create space',
    description:
      'Add a space at the end of a community. Its access rule decides who can open it: all members, by request or by invite. A space open to all members cannot have a capacity.',
    kind: 'write',
    idempotent: false,
    openWorld: false,
    input: CreateSpace.extend(CommunityIdParam.shape),
    call: ({ communityId, ...input }, { container, caller }) =>
      container.content.createSpace(communityId, input, caller.actor),
  }),
  defineTool({
    name: 'update_space',
    title: 'Update space',
    description:
      'Change a space name, description, access rule, capacity, settings, cover, background or icon. settings merges into the current settings. Each image must be a ready image from list_media; null clears it. Fields left out stay as they are.',
    kind: 'write',
    idempotent: true,
    openWorld: false,
    input: UpdateSpace.extend(CommunitySpaceParam.shape),
    call: ({ communityId, spaceId, ...input }, { container, caller }) =>
      container.content.updateSpace(communityId, spaceId, input, caller.actor),
  }),
  defineTool({
    name: 'reorder_spaces',
    title: 'Reorder spaces',
    description:
      'Set the space order of a community. Pass every space id of the community in the new order.',
    kind: 'write',
    idempotent: true,
    openWorld: false,
    input: OrderedIds.extend(CommunityIdParam.shape),
    call: ({ communityId, ids }, { container, caller }) =>
      container.content.reorderSpaces(communityId, ids, caller.actor),
  }),
  defineTool({
    name: 'set_space_topics',
    title: 'Set space topics',
    description:
      'Replace the topics of a space. An entry with an id keeps and renames that topic, one without adds a topic, and a topic left out is deleted. A topic that posts use cannot be deleted.',
    kind: 'write',
    idempotent: true,
    openWorld: false,
    input: SetSpaceTopics.extend(CommunitySpaceParam.shape),
    call: ({ communityId, spaceId, ...input }, { container, caller }) =>
      container.content.setSpaceTopics(communityId, spaceId, input, caller.actor),
  }),
  defineTool({
    name: 'add_space_link',
    title: 'Add space link',
    description:
      'Link a course, download or community into a space, after its other links. Returns the space.',
    kind: 'write',
    idempotent: false,
    openWorld: false,
    input: SpaceLinkBody.extend(CommunitySpaceParam.shape),
    call: ({ communityId, spaceId, contentId }, { container, caller }) =>
      container.content.addSpaceLink(communityId, spaceId, contentId, caller.actor),
  }),
  defineTool({
    name: 'reorder_space_links',
    title: 'Reorder space links',
    description: 'Set the link order of a space. Pass every link id of the space in the new order.',
    kind: 'write',
    idempotent: true,
    openWorld: false,
    input: OrderedIds.extend(CommunitySpaceParam.shape),
    call: ({ communityId, spaceId, ids }, { container, caller }) =>
      container.content.reorderSpaceLinks(communityId, spaceId, ids, caller.actor),
  }),
  defineTool({
    name: 'remove_space_link',
    title: 'Remove space link',
    description:
      'Take a link out of a space. The linked content itself is kept. Returns the space.',
    kind: 'destructive',
    idempotent: true,
    openWorld: false,
    input: SpaceLinkParam,
    call: ({ communityId, spaceId, linkId }, { container, caller }) =>
      container.content.removeSpaceLink(communityId, spaceId, linkId, caller.actor),
  }),
  defineTool({
    name: 'delete_space',
    title: 'Delete space',
    description: 'Permanently delete a space with its posts, comments and members.',
    kind: 'destructive',
    idempotent: true,
    openWorld: false,
    input: CommunitySpaceParam,
    call: ({ communityId, spaceId }, { container, caller }) =>
      container.content.deleteSpace(communityId, spaceId, caller.actor),
  }),
  defineTool({
    name: 'delete_community',
    title: 'Delete community',
    description:
      'Permanently delete a community with its spaces. Links to it from other spaces are removed.',
    kind: 'destructive',
    idempotent: true,
    openWorld: false,
    input: CommunityIdParam,
    call: ({ communityId }, { container, caller }) =>
      container.content.deleteCommunity(communityId, caller.actor),
  }),
  defineTool({
    name: 'get_community_analytics',
    title: 'Get community analytics',
    description: 'Membership, activity and moderation counts for one community.',
    kind: 'read',
    idempotent: true,
    openWorld: false,
    input: CommunityIdParam,
    call: ({ communityId }, { container, caller }) =>
      container.reporting.admin.communityAnalytics(communityId, caller.actor),
  }),
];
