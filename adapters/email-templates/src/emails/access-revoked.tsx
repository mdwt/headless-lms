import type { EmailTemplatePayloads, TemplateContext } from '@headless-lms/types';
import { Layout, Paragraph, PREVIEW_CTX } from './layout.js';

type Payload = EmailTemplatePayloads['accessRevoked'];

export const subject = (_ctx: TemplateContext, { entitlement }: Payload) =>
  `Your access to ${entitlement.content.title} has ended`;

export default function AccessRevoked({ ctx, payload }: { ctx: TemplateContext; payload: Payload }) {
  return (
    <Layout ctx={ctx} heading="Access ended">
      <Paragraph>
        Your access to {payload.entitlement.content.title} has ended. If you think this is a mistake, reply to this
        email.
      </Paragraph>
    </Layout>
  );
}

AccessRevoked.PreviewProps = {
  ctx: PREVIEW_CTX,
  payload: {
    entitlement: {
      id: 'ent1',
      studentId: 'stu1',
      firstName: 'Sam',
      lastName: 'Doe',
      studentEmail: 'sam@example.com',
      content: { id: 'demo', type: 'course', title: 'Fly Tying 101' },
      status: 'revoked',
      grantedAt: '2026-07-01T00:00:00.000Z',
      expiresAt: null,
      source: 'manual',
    },
  },
};
