// Email template catalog — every transactional email the system can send.
// The closed EmailTemplateId union is the guarantee that templates exist: a
// TemplateRenderer implementation must answer every member or fail typecheck.
import type { ContentType } from './schemas/content.js';

/** Branding threaded into every template. */
export interface TemplateContext {
  /** Product or organization name shown in the email. */
  brandName: string;
  /** Origin links resolve against (e.g. the admin app URL). */
  baseUrl: string;
  /** Origin student-facing links resolve against (the student portal URL). */
  studentPortalUrl: string;
}

/** A fully rendered email, ready for an EmailSender. */
export interface EmailContent {
  subject: string;
  html: string;
  text: string;
}

/** Template id → params. Adding an email = adding a row here. */
export interface EmailTemplateParams {
  magicLink: { url: string };
  studentInvite: { inviteUrl: string; studentName: string };
  memberInvite: { inviteUrl: string; inviterName: string; role: string };
  passwordReset: { resetUrl: string };
  passwordChanged: Record<string, never>;
  emailVerification: { verifyUrl: string };
  accessGranted: { contentTitle: string; contentId: string; contentType: ContentType };
  accessRevoked: { contentTitle: string };
  courseCompleted: { courseTitle: string };
  welcomeToCommunity: { communityTitle: string; communityId: string; spaceNames: string[] };
  membershipEndingSoon: { communityTitle: string; communityId: string; expiresAt: string };
  membershipEnded: { communityTitle: string; communityId: string };
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
  yourPostWasRemoved: { postTitle: string; spaceName: string; spaceId: string; communityId: string };
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
  youAreNowAModerator: { communityTitles: string[] };
  digest: { communityTitle: string; communityId: string };
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
