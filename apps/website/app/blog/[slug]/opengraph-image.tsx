import { ImageResponse } from "next/og";
import { notFound } from "next/navigation";
import { brand } from "@/components/logo";
import { loadOgFonts, OgLockup, ogFrame } from "@/lib/og";
import { blog } from "@/lib/source";
import { siteConfig } from "@/lib/site";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = `${siteConfig.name} blog post`;

type Props = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  return blog.getPages().map((post) => ({ slug: post.slugs[0] }));
}

export default async function BlogOpengraphImage(props: Props) {
  const params = await props.params;
  const post = blog.getPage([params.slug]);
  if (!post) {
    notFound();
  }

  return new ImageResponse(
    <div style={ogFrame}>
      <OgLockup />
      <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
        <div
          style={{
            display: "flex",
            fontFamily: "Fredoka",
            fontSize: 58,
            lineHeight: 1.08,
            letterSpacing: "-0.01em",
            maxWidth: 1060,
          }}
        >
          {post.data.title}
        </div>
        <div style={{ fontSize: 28, color: "#5e6058", maxWidth: 960 }}>{post.data.description}</div>
      </div>
      <div style={{ display: "flex", fontSize: 24, fontFamily: "Fredoka", color: brand.violet }}>
        {post.data.author} · {post.data.date}
      </div>
    </div>,
    { ...size, fonts: await loadOgFonts() },
  );
}
