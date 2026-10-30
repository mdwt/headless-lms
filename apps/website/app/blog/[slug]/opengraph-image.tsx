import { ImageResponse } from "next/og";
import { notFound } from "next/navigation";
import { brand } from "@/components/logo";
import { loadOgFonts, loadOgPainting, OgLockup, ogLabel } from "@/lib/og";
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
  const [fonts, painting] = await Promise.all([loadOgFonts(), loadOgPainting()]);

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        gap: 24,
        padding: 24,
        backgroundColor: brand.paper,
        color: brand.ink,
        fontFamily: "Geist",
      }}
    >
      <div
        style={{
          display: "flex",
          flex: 1,
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "32px 16px 32px 40px",
        }}
      >
        <OgLockup />
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={ogLabel}>
            <div
              style={{
                display: "flex",
                width: 9,
                height: 9,
                borderRadius: 9,
                backgroundColor: brand.ink,
              }}
            />
            Blog
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 54,
              fontWeight: 600,
              letterSpacing: -2.2,
              lineHeight: 1.05,
            }}
          >
            {post.data.title}
          </div>
          <div style={{ display: "flex", fontSize: 25, lineHeight: 1.45, color: "#525252" }}>
            {post.data.description}
          </div>
        </div>
        <div style={{ ...ogLabel, fontSize: 17 }}>
          {post.data.author} · {post.data.date}
        </div>
      </div>
      <div
        style={{
          display: "flex",
          width: 340,
          height: 582,
          borderRadius: 22,
          backgroundImage: `url(${painting})`,
          backgroundSize: "1108px 582px",
          backgroundPosition: "-760px 0",
        }}
      />
    </div>,
    { ...size, fonts },
  );
}
