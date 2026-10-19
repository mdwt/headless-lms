import { ImageResponse } from "next/og";
import { loadOgFonts, loadOgPainting, OgLockup } from "@/lib/og";
import { siteConfig } from "@/lib/site";

export const alt = `${siteConfig.name}: ${siteConfig.tagline}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const shadow = "0 2px 24px rgba(10, 30, 80, 0.45)";

export default async function OpengraphImage() {
  const [fonts, painting] = await Promise.all([loadOgFonts(), loadOgPainting()]);

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        position: "relative",
        fontFamily: "Geist",
        color: "#ffffff",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: 1200,
          height: 630,
          display: "flex",
          backgroundImage: `url(${painting})`,
          backgroundSize: "1200px 630px",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: 1200,
          height: 630,
          display: "flex",
          backgroundImage:
            "radial-gradient(ellipse 60% 50% at 50% 46%, rgba(16, 46, 116, 0.5), rgba(16, 46, 116, 0) 80%)",
        }}
      />
      <div
        style={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          alignItems: "center",
          width: "100%",
          padding: "56px 64px",
        }}
      >
        <OgLockup color="#ffffff" />
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 22 }}>
          <div
            style={{
              display: "flex",
              textAlign: "center",
              fontSize: 78,
              fontWeight: 600,
              letterSpacing: -3.5,
              lineHeight: 1,
              maxWidth: 980,
              textShadow: shadow,
            }}
          >
            The API-first LMS for building learning systems.
          </div>
          <div
            style={{
              display: "flex",
              textAlign: "center",
              fontSize: 27,
              fontWeight: 400,
              lineHeight: 1.4,
              maxWidth: 820,
              textShadow: shadow,
            }}
          >
            Courses, progress, entitlements and multi-tenancy as a typed TypeScript API.
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div
            style={{
              display: "flex",
              fontFamily: "Geist Mono",
              fontSize: 22,
              padding: "12px 22px",
              borderRadius: 8,
              backgroundColor: "rgba(255, 255, 255, 0.16)",
              border: "1px solid rgba(255, 255, 255, 0.4)",
            }}
          >
            $ {siteConfig.installCommand}
          </div>
          <div
            style={{
              display: "flex",
              fontFamily: "Geist Mono",
              fontSize: 18,
              letterSpacing: 1.2,
              textTransform: "uppercase",
              textShadow: shadow,
            }}
          >
            MIT · headless-lms.dev
          </div>
        </div>
      </div>
    </div>,
    { ...size, fonts },
  );
}
