import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { brand } from "@/components/logo";

async function loadFont(family: string, weight: number) {
  const css = await fetch(
    `https://fonts.googleapis.com/css2?family=${family}:wght@${weight}&display=swap`,
  ).then((res) => res.text());
  const url = css.match(/src: url\((.+?)\) format\('(opentype|truetype)'\)/)?.[1];
  if (!url) {
    throw new Error(`Font not found: ${family}`);
  }
  return fetch(url).then((res) => res.arrayBuffer());
}

export async function loadOgFonts() {
  const [semibold, regular, mono] = await Promise.all([
    loadFont("Geist", 600),
    loadFont("Geist", 400),
    loadFont("Geist+Mono", 500),
  ]);
  return [
    { name: "Geist", data: semibold, weight: 600 as const, style: "normal" as const },
    { name: "Geist", data: regular, weight: 400 as const, style: "normal" as const },
    { name: "Geist Mono", data: mono, weight: 500 as const, style: "normal" as const },
  ];
}

export async function loadOgPainting() {
  const data = await readFile(join(process.cwd(), "assets", "og", "towers.jpg"));
  return `data:image/jpeg;base64,${data.toString("base64")}`;
}

export function OgLockup({ color = brand.ink }: { color?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, color }}>
      <svg width="52" height="52" viewBox="0 0 100 100" fill={color}>
        <g transform="translate(10 4)">
          <rect x="52" y="40" width="23" height="50" rx="11.5" />
          <rect x="5" y="40" width="70" height="21" rx="10.5" />
          <rect x="5" y="2" width="23" height="88" rx="11.5" />
          <rect x="52" y="2" width="23" height="23" rx="8" />
        </g>
      </svg>
      <div
        style={{
          display: "flex",
          fontFamily: "Geist",
          fontWeight: 600,
          fontSize: 36,
          letterSpacing: -1.4,
        }}
      >
        headless lms
      </div>
    </div>
  );
}

export const ogLabel = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  fontFamily: "Geist Mono",
  fontSize: 18,
  letterSpacing: 1.2,
  textTransform: "uppercase",
  color: "#6b6b6b",
} as const;
