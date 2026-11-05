import {
  CommunityIdParam,
  CommunityMembersQuery,
  CommunitySpaceParam,
  OrgUserBody,
  PageQuery,
  SpaceMemberParam,
} from '../../schemas/index.js';
import { defineTool, type Tool } from '../tool.js';

export const communityMemberTools: Tool[] = [
  defineTool({
    name: 'list_community_members',
    title: 'List community members',
    description:
      'Page through everyone with active access to a community, granted directly or through a bundle. Search by name or email.',
    operation: 'reporting.admin.communityMembers',
    kind: 'read',
    idempotent: true,
    openWorld: false,
    input: CommunityMembersQuery.extend(CommunityIdParam.shape),
    call: ({ communityId, ...query }, { container, caller }) =>
      container.reporting.admin.communityMembers(communityId, query, caller.actor),
  }),
  defineTool({
    name: 'list_space_members',
    title: 'List space members',
    description:
      "Page through a space's members, its open requests to join and its open invitations.",
    operation: 'entitlements.listSpaceMembers',
    kind: 'read',
    idempotent: true,
    openWorld: false,
    input: PageQuery.extend(CommunitySpaceParam.shape),
    call: ({ communityId, spaceId, ...page }, { container, caller }) =>
      container.entitlements.listSpaceMembers(communityId, spaceId, page, caller.actor),
  }),
  defineTool({
    name: 'add_space_member',
    title: 'Add space member',
    description:
      'Place a member of the community straight into a space, with no request or invitation. Not for a space open to all members, or one that is full.',
    operation: 'entitlements.addSpaceMember',
    kind: 'write',
    idempotent: false,
    openWorld: false,
    input: OrgUserBody.extend(CommunitySpaceParam.shape),
    call: ({ communityId, spaceId, orgUserId }, { container, caller }) =>
      container.entitlements.addSpaceMember(communityId, spaceId, orgUserId, caller.actor),
  }),
  defineTool({
    name: 'invite_space_member',
    title: 'Invite space member',
    description:
      'Invite a member of the community into an invite-only space. They are notified and join when they accept.',
    operation: 'entitlements.invite',
    kind: 'write',
    idempotent: false,
    openWorld: true,
    input: OrgUserBody.extend(CommunitySpaceParam.shape),
    call: ({ communityId, spaceId, orgUserId }, { container, caller }) =>
      container.entitlements.invite(communityId, spaceId, orgUserId, caller.actor),
  }),
  defineTool({
    name: 'approve_space_request',
    title: 'Approve space request',
    description: "Approve a person's request to join a space. Not when the space is full.",
    operation: 'entitlements.approve',
    kind: 'write',
    idempotent: true,
    openWorld: false,
    input: SpaceMemberParam,
    call: ({ communityId, spaceId, orgUserId }, { container, caller }) =>
      container.entitlements.approve(communityId, spaceId, orgUserId, caller.actor),
  }),
  defineTool({
    name: 'decline_space_request',
    title: 'Decline space request',
    description: "Decline a person's request to join a space.",
    operation: 'entitlements.decline',
    kind: 'write',
    idempotent: true,
    openWorld: false,
    input: SpaceMemberParam,
    call: ({ communityId, spaceId, orgUserId }, { container, caller }) =>
      container.entitlements.decline(communityId, spaceId, orgUserId, caller.actor),
  }),
  defineTool({
    name: 'remove_space_member',
    title: 'Remove space member',
    description:
      'Remove a person from a space, whether they are a member, asked to join or were invited. Their access to the community stays. Not for a space open to all members.',
    operation: 'entitlements.remove',
    kind: 'destructive',
    idempotent: true,
    openWorld: false,
    input: SpaceMemberParam,
    call: ({ communityId, spaceId, orgUserId }, { container, caller }) =>
      container.entitlements.remove(communityId, spaceId, orgUserId, caller.actor),
  }),
];
