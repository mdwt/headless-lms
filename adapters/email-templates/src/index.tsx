// Default TemplateRenderer: react-email components rendered at call time.
import { render } from "@react-email/render";
import type { JSX } from "react";
import type {
  EmailContent,
  EmailTemplateId,
  EmailTemplateParams,
  TemplateContext,
  TemplateRenderer,
} from "@headless-lms/core/types";
import MagicLink, { subject as magicLink } from "./emails/magic-link.js";
import StudentInvite, { subject as studentInvite } from "./emails/student-invite.js";
import MemberInvite, { subject as memberInvite } from "./emails/member-invite.js";
import PasswordReset, { subject as passwordReset } from "./emails/password-reset.js";
import PasswordChanged, { subject as passwordChanged } from "./emails/password-changed.js";
import EmailVerification, { subject as emailVerification } from "./emails/email-verification.js";
import AccessGranted, { subject as accessGranted } from "./emails/access-granted.js";
import AccessRevoked, { subject as accessRevoked } from "./emails/access-revoked.js";
import CourseCompleted, { subject as courseCompleted } from "./emails/course-completed.js";
import {
  addedToGroupChat,
  digest,
  invitedToSpace,
  joinRequest,
  membershipEnded,
  membershipEndingSoon,
  messageRequest,
  messageWasFlagged,
  newCommentOnPost,
  newMessage,
  newPostInSpace,
  postAwaitingReview,
  replyToYourComment,
  requestApproved,
  requestDeclined,
  somethingWasFlagged,
  welcomeToCommunity,
  youAreNowAModerator,
  yourCommentWasRemoved,
  yourPostWasPublished,
  yourPostWasRemoved,
} from "./emails/community.js";

interface Entry<K extends EmailTemplateId> {
  subject: (ctx: TemplateContext, params: EmailTemplateParams[K]) => string;
  Component: (props: { ctx: TemplateContext; params: EmailTemplateParams[K] }) => JSX.Element;
}

// The catalog is closed: a missing key here is a compile error.
const registry: { [K in EmailTemplateId]: Entry<K> } = {
  magicLink: { subject: magicLink, Component: MagicLink },
  studentInvite: { subject: studentInvite, Component: StudentInvite },
  memberInvite: { subject: memberInvite, Component: MemberInvite },
  passwordReset: { subject: passwordReset, Component: PasswordReset },
  passwordChanged: { subject: passwordChanged, Component: PasswordChanged },
  emailVerification: { subject: emailVerification, Component: EmailVerification },
  accessGranted: { subject: accessGranted, Component: AccessGranted },
  accessRevoked: { subject: accessRevoked, Component: AccessRevoked },
  courseCompleted: { subject: courseCompleted, Component: CourseCompleted },
  welcomeToCommunity: {
    subject: welcomeToCommunity.subject,
    Component: welcomeToCommunity.Component,
  },
  membershipEndingSoon: {
    subject: membershipEndingSoon.subject,
    Component: membershipEndingSoon.Component,
  },
  membershipEnded: { subject: membershipEnded.subject, Component: membershipEnded.Component },
  newPostInSpace: { subject: newPostInSpace.subject, Component: newPostInSpace.Component },
  yourPostWasPublished: {
    subject: yourPostWasPublished.subject,
    Component: yourPostWasPublished.Component,
  },
  yourPostWasRemoved: {
    subject: yourPostWasRemoved.subject,
    Component: yourPostWasRemoved.Component,
  },
  newCommentOnPost: { subject: newCommentOnPost.subject, Component: newCommentOnPost.Component },
  replyToYourComment: {
    subject: replyToYourComment.subject,
    Component: replyToYourComment.Component,
  },
  yourCommentWasRemoved: {
    subject: yourCommentWasRemoved.subject,
    Component: yourCommentWasRemoved.Component,
  },
  requestApproved: { subject: requestApproved.subject, Component: requestApproved.Component },
  requestDeclined: { subject: requestDeclined.subject, Component: requestDeclined.Component },
  invitedToSpace: { subject: invitedToSpace.subject, Component: invitedToSpace.Component },
  messageRequest: { subject: messageRequest.subject, Component: messageRequest.Component },
  newMessage: { subject: newMessage.subject, Component: newMessage.Component },
  addedToGroupChat: { subject: addedToGroupChat.subject, Component: addedToGroupChat.Component },
  youAreNowAModerator: {
    subject: youAreNowAModerator.subject,
    Component: youAreNowAModerator.Component,
  },
  digest: { subject: digest.subject, Component: digest.Component },
  postAwaitingReview: {
    subject: postAwaitingReview.subject,
    Component: postAwaitingReview.Component,
  },
  joinRequest: { subject: joinRequest.subject, Component: joinRequest.Component },
  somethingWasFlagged: {
    subject: somethingWasFlagged.subject,
    Component: somethingWasFlagged.Component,
  },
  messageWasFlagged: {
    subject: messageWasFlagged.subject,
    Component: messageWasFlagged.Component,
  },
};

export class ReactEmailTemplateRenderer implements TemplateRenderer {
  async render<K extends EmailTemplateId>(
    id: K,
    ctx: TemplateContext,
    params: EmailTemplateParams[K],
  ): Promise<EmailContent> {
    const entry = registry[id] as Entry<K>;
    const element = <entry.Component ctx={ctx} params={params} />;
    const [html, text] = await Promise.all([render(element), render(element, { plainText: true })]);
    return { subject: entry.subject(ctx, params), html, text };
  }
}
