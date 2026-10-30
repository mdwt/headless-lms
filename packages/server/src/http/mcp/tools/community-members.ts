import {
  CommunityIdParam,
  CommunityMembersQuery,
  CommunitySpaceParam,
  OrgUserBody,
  PageQuery,
  SpaceMemberParam,
} from '../../schemas/index.js';
import { actor, defineTool, type Tool } from '../tool.js';

export const communityMemberTools: Tool[] = [
  defineTool({
    name: 'list_community_members',
    title: 'List community members',
    description:
      'Page through everyone with active access to a community, granted directly or through a bundle. Search by name or email.',
    scope: 'community_members:read',
    kind: 'read',
    idempotent: true,
    openWorld: false,
    input: CommunityMembersQuery.extend(CommunityIdParam.shape),
    call: ({ communityId, ...query }, { container, scope }) =>
      container.reporting.admin.communityMembers(scope.orgId, communityId, query),
  }),
  defineTool({
    name: 'list_space_members',
    title: 'List space members',
    description:
      "Page through a space's members, its open requests to join and its open invitations.",
    scope: 'community_members:read',
    kind: 'read',
    idempotent: true,
    openWorld: false,
    input: PageQuery.extend(CommunitySpaceParam.shape),
    call: ({ communityId, spaceId, ...page }, { container, scope }) =>
      container.entitlements.listSpaceMembers(
        scope.orgId,
        actor(scope),
        communityId,
        spaceId,
        page,
      ),
  }),
  defineTool({
    name: 'add_space_member',
    title: 'Add space member',
    description:
      'Place a member of the community straight into a space, with no request or invitation. Not for a space open to all members, or one that is full.',
    scope: 'community_members:write',
    kind: 'write',
    idempotent: false,
    openWorld: false,
    input: OrgUserBody.extend(CommunitySpaceParam.shape),
    call: ({ communityId, spaceId, orgUserId }, { container, scope }) =>
      container.entitlements.addSpaceMember(
        scope.orgId,
        actor(scope),
        communityId,
        spaceId,
        orgUserId,
      ),
  }),
  defineTool({
    name: 'invite_space_member',
    title: 'Invite space member',
    description:
      'Invite a member of the community into an invite-only space. They are notified and join when they accept.',
    scope: 'community_members:write',
    kind: 'write',
    idempotent: false,
    openWorld: true,
    input: OrgUserBody.extend(CommunitySpaceParam.shape),
    call: ({ communityId, spaceId, orgUserId }, { container, scope }) =>
      container.entitlements.invite(scope.orgId, actor(scope), communityId, spaceId, orgUserId),
  }),
  defineTool({
    name: 'approve_space_request',
    title: 'Approve space request',
    description: "Approve a person's request to join a space. Not when the space is full.",
    scope: 'community_members:write',
    kind: 'write',
    idempotent: true,
    openWorld: false,
    input: SpaceMemberParam,
    call: ({ communityId, spaceId, orgUserId }, { container, scope }) =>
      container.entitlements.approve(scope.orgId, actor(scope), communityId, spaceId, orgUserId),
  }),
  defineTool({
    name: 'decline_space_request',
    title: 'Decline space request',
    description: "Decline a person's request to join a space.",
    scope: 'community_members:write',
    kind: 'write',
    idempotent: true,
    openWorld: false,
    input: SpaceMemberParam,
    call: ({ communityId, spaceId, orgUserId }, { container, scope }) =>
      container.entitlements.decline(scope.orgId, actor(scope), communityId, spaceId, orgUserId),
  }),
  defineTool({
    name: 'remove_space_member',
    title: 'Remove space member',
    description:
      "Remove a person from a space, whether they are a member, asked to join or were invited. Their access to the community stays. Not for a space open to all members.",
    scope: 'community_members:write',
    kind: 'destructive',
    idempotent: true,
    openWorld: false,
    input: SpaceMemberParam,
    call: ({ communityId, spaceId, orgUserId }, { container, scope }) =>
      container.entitlements.remove(scope.orgId, actor(scope), communityId, spaceId, orgUserId),
  }),
];
