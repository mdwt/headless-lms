import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { brand } from "@/components/logo";

function loadFont(file: string) {
  return readFile(join(process.cwd(), "assets", "fonts", file));
}

export async function loadOgFonts() {
  const [semibold, regular, mono] = await Promise.all([
    loadFont("Geist-SemiBold.ttf"),
    loadFont("Geist-Regular.ttf"),
    loadFont("GeistMono-Medium.ttf"),
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
