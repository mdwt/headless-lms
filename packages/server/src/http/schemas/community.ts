import { z } from 'zod';
import {
  communityStatusSchema,
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
import type { CommunityAnalytics as DomainCommunityAnalytics } from '@headless-lms/core/reporting/admin';
import type {
  CommunityHome as DomainCommunityHome,
  DirectoryEntry as DomainDirectoryEntry,
} from '@headless-lms/core/reporting/member';
import { ListQuery, paginated, type Matches } from './shared.js';

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

export const CommunityHomeSpace = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  memberCount: z.number().int(),
  capacity: z.number().int().nullable(),
  open: z.boolean(),
  accessRule: z.enum(['all_members', 'by_request', 'by_invite']),
  standing: z
    .enum(['open', 'member', 'requested', 'invited', 'full', 'none'])
    .describe('Where the viewer stands with this space, and so which action it offers'),
  settings: z.object({
    comments: z.boolean(),
    reactions: z.boolean(),
    requireReview: z.boolean(),
  }),
  topics: z.array(z.object({ id: z.string(), name: z.string() })),
  links: z.array(
    z.object({
      id: z.string(),
      contentId: z.string(),
      type: z.enum(['course', 'download', 'community']),
      title: z.string(),
    }),
  ),
});

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
