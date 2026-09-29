import {
  Body,
  Button,
  Column,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Link,
  Row,
  Section,
  Tailwind,
  Text,
} from "@react-email/components";
import type { ReactNode } from "react";
import type { TemplateContext } from "@headless-lms/core/types";

const LOGO_URL = "https://headless-lms.dev/logo.png";
const ICON_URL = "https://headless-lms.dev/apple-icon";

export function Layout({
  ctx,
  heading,
  children,
}: {
  ctx: TemplateContext;
  heading: string;
  children: ReactNode;
}) {
  return (
    <Html>
      <Tailwind>
        <Head />
        <Body className="bg-white font-sans">
          <Container className="mx-auto max-w-[560px] px-6 pt-5 pb-12">
            <Img src={LOGO_URL} alt={ctx.brandName} height={32} className="h-[32px]" />
            <Heading className="mt-[28px] mb-0 text-[24px] font-normal leading-[1.3] tracking-[-0.5px] text-[#484848]">
              {heading}
            </Heading>
            <Section>{children}</Section>
            <Hr className="mt-[42px] mb-[26px] border-[#dfe1e4]" />
            <Row>
              <Column className="w-[24px]">
                <Img src={ICON_URL} alt="" width={24} height={24} className="rounded-[6px]" />
              </Column>
              <Column className="pl-[8px]">
                <Link href={ctx.baseUrl} className="text-[14px] text-[#b4becc]">
                  {ctx.brandName}
                </Link>
              </Column>
            </Row>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}

export function EmailButton({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Section className="py-[20px]">
      <Button
        href={href}
        className="rounded-[3px] bg-[#18181b] px-[23px] py-[11px] text-[15px] font-semibold text-white no-underline"
      >
        {children}
      </Button>
    </Section>
  );
}

export function Paragraph({ children }: { children: ReactNode }) {
  return <Text className="my-[15px] text-[15px] leading-[1.4] text-[#3c4149]">{children}</Text>;
}

export const PREVIEW_CTX: TemplateContext = {
  brandName: "Acme LMS",
  baseUrl: "http://localhost:8001",
  studentPortalUrl: "http://localhost:8002",
};
