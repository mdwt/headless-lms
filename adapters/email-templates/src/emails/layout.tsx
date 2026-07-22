import { Body, Container, Head, Heading, Html, Img, Section, Text } from '@react-email/components';
import type { ReactNode } from 'react';
import type { TemplateContext } from '@headless-lms/types';

export function Layout({ ctx, heading, children }: {
  ctx: TemplateContext;
  heading: string;
  children: ReactNode;
}) {
  return (
    <Html>
      <Head />
      <Body style={{ backgroundColor: '#f6f6f6', fontFamily: 'Helvetica, Arial, sans-serif' }}>
        <Container style={{ backgroundColor: '#ffffff', margin: '24px auto', padding: '32px', maxWidth: '480px' }}>
          {ctx.logoUrl ? (
            <Img src={ctx.logoUrl} alt={ctx.brandName} height={32} style={{ marginBottom: '16px' }} />
          ) : (
            <Text style={{ fontWeight: 700, marginBottom: '16px' }}>{ctx.brandName}</Text>
          )}
          <Heading as="h2" style={{ fontSize: '20px' }}>{heading}</Heading>
          <Section>{children}</Section>
          <Text style={{ color: '#8a8a8a', fontSize: '12px', marginTop: '32px' }}>
            Sent by {ctx.brandName} · {ctx.baseUrl}
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export const PREVIEW_CTX: TemplateContext = {
  brandName: 'Acme LMS',
  baseUrl: 'http://localhost:8001',
};
