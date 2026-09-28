import type { EmailTemplateParams, TemplateContext } from "@headless-lms/core/types";
import { Layout, Paragraph, PREVIEW_CTX } from "./layout.js";

type Params = EmailTemplateParams["passwordChanged"];

export const subject = (ctx: TemplateContext, _params: Params) =>
  `Your ${ctx.brandName} password was changed`;

export default function PasswordChanged({ ctx }: { ctx: TemplateContext; params: Params }) {
  return (
    <Layout ctx={ctx} heading="Your password was changed">
      <Paragraph>The password for your {ctx.brandName} account was just changed.</Paragraph>
      <Paragraph>If you didn't make this change, reply to this email right away.</Paragraph>
    </Layout>
  );
}

PasswordChanged.PreviewProps = {
  ctx: PREVIEW_CTX,
  params: {},
};
