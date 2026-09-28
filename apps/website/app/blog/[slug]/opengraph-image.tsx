import { ImageResponse } from "next/og";
import { notFound } from "next/navigation";
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
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: 80,
        backgroundColor: "#171512",
        color: "#f4f1ea",
        fontFamily: "sans-serif",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
          <path
            d="M12 2 3 6.5v11L12 22l9-4.5v-11L12 2Z"
            stroke="#ddb15f"
            strokeWidth="1.6"
            strokeLinejoin="round"
            opacity="0.45"
          />
          <path
            d="m8 9.5 3.5 2.5L8 14.5M13 15h3"
            stroke="#ddb15f"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <div style={{ fontSize: 30, fontWeight: 600 }}>{siteConfig.name}</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <div style={{ fontSize: 60, fontWeight: 700, lineHeight: 1.1, maxWidth: 980 }}>
          {post.data.title}
        </div>
        <div style={{ fontSize: 26, color: "#a59d8f", maxWidth: 900 }}>{post.data.description}</div>
      </div>
      <div style={{ display: "flex", fontSize: 22, color: "#ddb15f" }}>
        {post.data.author} · {post.data.date}
      </div>
    </div>,
    size,
  );
}
