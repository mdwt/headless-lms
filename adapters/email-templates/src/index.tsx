// Default TemplateRenderer: react-email components rendered at call time.
import { render } from '@react-email/render';
import type { JSX } from 'react';
import type {
  EmailContent,
  EmailTemplateId,
  EmailTemplateParams,
  TemplateContext,
  TemplateRenderer,
} from '@headless-lms/types';
import MagicLink, { subject as magicLink } from './emails/magic-link.js';
import StudentInvite, { subject as studentInvite } from './emails/student-invite.js';
import MemberInvite, { subject as memberInvite } from './emails/member-invite.js';
import PasswordReset, { subject as passwordReset } from './emails/password-reset.js';
import EmailVerification, { subject as emailVerification } from './emails/email-verification.js';
import AccessGranted, { subject as accessGranted } from './emails/access-granted.js';
import AccessRevoked, { subject as accessRevoked } from './emails/access-revoked.js';
import CourseCompleted, { subject as courseCompleted } from './emails/course-completed.js';

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
  emailVerification: { subject: emailVerification, Component: EmailVerification },
  accessGranted: { subject: accessGranted, Component: AccessGranted },
  accessRevoked: { subject: accessRevoked, Component: AccessRevoked },
  courseCompleted: { subject: courseCompleted, Component: CourseCompleted },
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
