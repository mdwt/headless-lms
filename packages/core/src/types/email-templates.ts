// Email template catalog — every transactional email the system can send.
// The closed EmailTemplateId union is the guarantee that templates exist: a
// TemplateRenderer implementation must answer every member or fail typecheck.
import type { ContentType } from './schemas/content.js';
import type { Hosts } from './schemas/organizations.js';

/** Branding threaded into every template. */
export interface TemplateContext {
  /** Product or organization name shown in the email. */
  brandName: string;
  /** Origin links resolve against (e.g. the admin app URL). */
  baseUrl: string;
  /** The organization's course app and community app origins; null for an email sent outside an organization. */
  hosts: Hosts | null;
}

/** A fully rendered email, ready for an EmailSender. */
export interface EmailContent {
  subject: string;
  html: string;
  text: string;
}

export interface EventEmailParams {
  eventId: string;
  eventTitle: string;
  startsAt: string;
  endsAt: string;
  timeZone: string;
}

/** Template id → params. Adding an email = adding a row here. */
export interface EmailTemplateParams {
  magicLink: { url: string };
  studentInvite: { inviteUrl: string; studentName: string };
  memberInvite: { inviteUrl: string; inviterName: string; role: string };
  passwordReset: { resetUrl: string };
  passwordChanged: Record<string, never>;
  emailVerification: { verifyUrl: string };
  accessGranted: { contentTitle: string; contentId: string; contentType: ContentType | 'bundle' };
  accessRevoked: { contentTitle: string };
  courseCompleted: { courseTitle: string };
  welcomeToCommunity: { communityTitle: string; communityId: string; spaceNames: string[] };
  membershipEndingSoon: { communityTitle: string; communityId: string; expiresAt: string };
  membershipEnded: { communities: { communityId: string; communityTitle: string }[] };
  newPostInSpace: {
    spaceName: string;
    postTitle: string;
    authorName: string;
    excerpt: string;
    postId: string;
    communityId: string;
  };
  yourPostWasPublished: {
    postTitle: string;
    spaceName: string;
    postId: string;
    communityId: string;
  };
  yourPostWasRemoved: {
    postTitle: string;
    spaceName: string;
    spaceId: string;
    communityId: string;
  };
  newCommentOnPost: {
    postTitle: string;
    commenterName: string;
    excerpt: string;
    commentId: string;
    postId: string;
    communityId: string;
  };
  replyToYourComment: {
    postTitle: string;
    commenterName: string;
    excerpt: string;
    commentId: string;
    postId: string;
    communityId: string;
  };
  yourCommentWasRemoved: { postTitle: string; postId: string; communityId: string };
  requestApproved: { spaceName: string; spaceId: string; communityId: string };
  requestDeclined: { spaceName: string; communityId: string };
  invitedToSpace: { spaceName: string; inviterName: string; spaceId: string; communityId: string };
  messageRequest: { senderName: string; excerpt: string; chatId: string; communityId: string };
  newMessage: {
    senderName: string;
    chatTitle: string;
    excerpt: string;
    chatId: string;
    communityId: string;
  };
  addedToGroupChat: {
    adderName: string;
    participantNames: string[];
    chatId: string;
    communityId: string;
  };
  roleAssigned: {
    roleName: string;
    place: string;
    contentId: string | null;
    contentType: ContentType | null;
  };
  digest: {
    communityTitle: string;
    communityId: string;
    from: string;
    to: string;
    posts: {
      postId: string;
      title: string;
      authorName: string;
      spaceName: string;
      commentCount: number;
    }[];
  };
  postAwaitingReview: {
    spaceName: string;
    postTitle: string;
    authorName: string;
    spaceId: string;
    communityId: string;
  };
  joinRequest: {
    spaceName: string;
    memberName: string;
    seatsLeft: string;
    spaceId: string;
    communityId: string;
  };
  somethingWasFlagged: {
    spaceName: string;
    excerpt: string;
    reason: string;
    spaceId: string;
    communityId: string;
  };
  messageWasFlagged: { reason: string; communityId: string };
  postReacted: {
    postTitle: string;
    reactorName: string;
    reaction: string;
    postId: string;
    communityId: string;
  };
  commentReacted: {
    postTitle: string;
    excerpt: string;
    reactorName: string;
    reaction: string;
    commentId: string;
    postId: string;
    communityId: string;
  };
  mention: { authorName: string; excerpt: string; communityId: string } & (
    | { postTitle: string; postId: string; commentId?: string }
    | { chatTitle: string; chatId: string }
  );
  messageReacted: {
    excerpt: string;
    reactorName: string;
    reaction: string;
    chatId: string;
    communityId: string;
  };
  courseActivityAdded: {
    courseTitle: string;
    moduleTitle: string;
    activityTitle: string;
    courseId: string;
    activityId: string;
  };
  activityCommentCreated: {
    activityTitle: string;
    courseTitle: string;
    commenterName: string;
    excerpt: string;
    courseId: string;
    activityId: string;
    commentId: string;
  };
  activityCommentRemoved: {
    activityTitle: string;
    courseTitle: string;
    courseId: string;
    activityId: string;
  };
  activityCommentReacted: {
    activityTitle: string;
    courseTitle: string;
    excerpt: string;
    reactorName: string;
    reaction: string;
    courseId: string;
    activityId: string;
    commentId: string;
  };
  activityCommentFlagged: {
    activityTitle: string;
    courseTitle: string;
    excerpt: string;
    reason: string;
    courseId: string;
    activityId: string;
  };
  activityMention: {
    authorName: string;
    excerpt: string;
    activityTitle: string;
    courseTitle: string;
    courseId: string;
    activityId: string;
  };
  eventGranted: EventEmailParams;
  eventStartingSoon: EventEmailParams & { leadText: string };
  eventChanged: EventEmailParams & { changed: 'time' | 'location' | 'time_and_location' };
  eventCanceled: EventEmailParams;
  eventRevoked: EventEmailParams;
}

export type EmailTemplateId = keyof EmailTemplateParams;

/** Resolves a template + data to rendered content. Deployment-swappable;
 *  default implementation: @headless-lms/adapter-email-templates. */
export interface TemplateRenderer {
  render<K extends EmailTemplateId>(
    id: K,
    ctx: TemplateContext,
    params: EmailTemplateParams[K],
  ): Promise<EmailContent>;
}
