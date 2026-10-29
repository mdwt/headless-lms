import { z } from 'zod';
import {
  communityStatusSchema,
  roleSchema,
  communityViewSchema,
  createCommunityInputSchema,
  createSpaceInputSchema,
  dmSettingsSchema,
  patchDmSettingsInputSchema,
  setSpaceTopicsInputSchema,
  spaceDetailSchema,
  spaceMemberSchema,
  updateCommunityInputSchema,
  updateSpaceInputSchema,
} from '@headless-lms/core/schemas';
import type {
  CommunityAnalytics as DomainCommunityAnalytics,
  CommunityMember as DomainCommunityMember,
} from '@headless-lms/core/reporting/admin';
import type {
  CommunityHome as DomainCommunityHome,
  CommunityHomeSpace as DomainCommunityHomeSpace,
  DirectoryEntry as DomainDirectoryEntry,
} from '@headless-lms/core/reporting/member';
import { ListQuery, OrgUserProfileSchema, PageQuery, paginated, type Matches } from './shared.js';

export const Community = communityViewSchema;
export const CommunitiesQuery = ListQuery.extend({
  status: communityStatusSchema.optional(),
});
export const CommunitiesPage = paginated(Community);
export const CreateCommunity = createCommunityInputSchema;
export const UpdateCommunity = updateCommunityInputSchema;
export const PatchDmSettings = patchDmSettingsInputSchema;
export const DmSettings = dmSettingsSchema;
export const SpaceDetail = spaceDetailSchema;
export const SpaceMember = spaceMemberSchema;
export const SpaceMembers = z.array(SpaceMember);
export const CreateSpace = createSpaceInputSchema;
export const UpdateSpace = updateSpaceInputSchema;
export const SetSpaceTopics = setSpaceTopicsInputSchema;
export const OrderedIds = z.object({ ids: z.array(z.string()).min(1) }).strict();
export const SpaceLinkBody = z.object({ contentId: z.string() }).strict();

export const CommunityIdParam = z.object({ id: z.string() });
export const CommunitySpaceParam = z.object({ communityId: z.string(), spaceId: z.string() });
export const SpaceLinkParam = CommunitySpaceParam.extend({ linkId: z.string() });
export const CommunityPostParam = z.object({ communityId: z.string(), postId: z.string() });
export const CommunityCommentParam = z.object({ communityId: z.string(), commentId: z.string() });
export const CommunityMessageParam = z.object({ communityId: z.string(), messageId: z.string() });
export const CommunityChatParam = z.object({ communityId: z.string(), chatId: z.string() });

export const CommunityMember = OrgUserProfileSchema.extend({ role: roleSchema });
type _CommunityMemberMatches = Matches<DomainCommunityMember, z.infer<typeof CommunityMember>> &
  Matches<z.infer<typeof CommunityMember>, DomainCommunityMember>;
export const CommunityMembersQuery = PageQuery.extend({ search: z.string().trim().optional() });
export const CommunityMembersPage = paginated(CommunityMember);

export const DirectoryEntry = z.object({
  orgUserId: z.string(),
  userId: z.string(),
  role: z.string(),
  displayName: z.string().nullable(),
  headline: z.string().nullable(),
  bio: z.string().nullable(),
  imageAssetId: z.string().nullable(),
  imageUrl: z.string().nullable(),
});
type _DirectoryMatches = Matches<DomainDirectoryEntry, z.infer<typeof DirectoryEntry>> &
  Matches<z.infer<typeof DirectoryEntry>, DomainDirectoryEntry>;

const CommunityHomeSpaceBase = z.object({
  id: z.string(),
  name: z.string(),
  memberCount: z.number().int().describe('Active space members'),
  accessRule: z.enum(['all_members', 'by_request', 'by_invite']),
  standing: z
    .enum(['open', 'member', 'requested', 'invited', 'full', 'none'])
    .describe('Where the viewer stands with this space, and so which action it offers'),
});

export const LockedCommunitySpace = CommunityHomeSpaceBase.extend({
  locked: z
    .literal(true)
    .describe(
      'The viewer cannot open this space. Only enough to request a place, accept an invite or contact staff is served; never its description, topics, links or settings',
    ),
});

export const OpenCommunitySpace = CommunityHomeSpaceBase.extend({
  locked: z.literal(false).describe('The viewer can open this space and read its feed'),
  description: z.string().nullable(),
  capacity: z.number().int().nullable(),
  settings: z.object({
    comments: z.boolean(),
    reactions: z.boolean(),
    requireReview: z.boolean(),
  }),
  topics: z.array(z.object({ id: z.string(), name: z.string() })),
  links: z
    .array(
      z.object({
        id: z.string(),
        contentId: z.string(),
        type: z.enum(['course', 'download', 'community']),
        title: z.string(),
      }),
    )
    .describe('Linked content that is published; staff also see unpublished targets'),
});

export const CommunityHomeSpace = z
  .discriminatedUnion('locked', [LockedCommunitySpace, OpenCommunitySpace])
  .describe(
    'A space as the viewer sees it. A by-invite space the viewer is not invited to or a member of is never served',
  );
type _HomeSpaceMatches = Matches<DomainCommunityHomeSpace, z.infer<typeof CommunityHomeSpace>> &
  Matches<z.infer<typeof CommunityHomeSpace>, DomainCommunityHomeSpace>;

export const CommunityHome = z.object({
  communityId: z.string(),
  title: z.string(),
  description: z.string(),
  thumbnailUrl: z.string().nullable(),
  dm: dmSettingsSchema,
  spaces: z.array(CommunityHomeSpace),
});
type _HomeMatches = Matches<DomainCommunityHome, z.infer<typeof CommunityHome>> &
  Matches<z.infer<typeof CommunityHome>, DomainCommunityHome>;

export const CommunityAnalytics = z.object({
  memberCount: z.number().int(),
  activeMembers: z.number().int(),
  postsPerSpace: z.array(z.object({ spaceId: z.string(), count: z.number().int() })),
  commentsPerPost: z.array(z.object({ postId: z.string(), count: z.number().int() })),
  messagesSent: z.number().int(),
  flagsRaised: z.number().int(),
  flagsResolved: z.number().int(),
  grantsLapsed: z.number().int(),
  grantsRenewed: z.number().int(),
});
type _AnalyticsMatches = Matches<DomainCommunityAnalytics, z.infer<typeof CommunityAnalytics>> &
  Matches<z.infer<typeof CommunityAnalytics>, DomainCommunityAnalytics>;
