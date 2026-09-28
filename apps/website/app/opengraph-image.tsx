import { ImageResponse } from "next/og";
import { brand } from "@/components/logo";
import { loadOgFonts, OgLockup, ogFrame } from "@/lib/og";
import { siteConfig } from "@/lib/site";

export const alt = `${siteConfig.name}: ${siteConfig.tagline}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpengraphImage() {
  const chips = [
    { label: "indie devs", color: brand.violet, tilt: -2 },
    { label: "vibe coders", color: brand.coral, tilt: 1.5 },
    { label: "course creators", color: brand.mint, tilt: -1 },
  ];

  return new ImageResponse(
    <div style={ogFrame}>
      <OgLockup />
      <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
        <div style={{ display: "flex", gap: 14 }}>
          {chips.map((chip) => (
            <div
              key={chip.label}
              style={{
                display: "flex",
                fontFamily: "Fredoka",
                fontSize: 26,
                padding: "6px 20px",
                borderRadius: 999,
                color: chip.color,
                backgroundColor: `${chip.color}22`,
                transform: `rotate(${chip.tilt}deg)`,
              }}
            >
              {chip.label}
            </div>
          ))}
        </div>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            fontFamily: "Fredoka",
            fontSize: 64,
            lineHeight: 1.05,
            letterSpacing: "-0.01em",
            maxWidth: 1060,
          }}
        >
          The API-first LMS for building&nbsp;
          <span style={{ color: brand.violet }}>learning systems</span>
        </div>
        <div style={{ fontSize: 28, color: "#5e6058", maxWidth: 940 }}>
          Open-source headless LMS in modern TypeScript. Typed SDK, composable adapters, MCP
          endpoint.
        </div>
      </div>
      <div style={{ display: "flex", fontSize: 26, fontFamily: "Fredoka", color: brand.violet }}>
        headless-lms.dev
      </div>
    </div>,
    { ...size, fonts: await loadOgFonts() },
  );
}
