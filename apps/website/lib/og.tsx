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
  const [display, body] = await Promise.all([loadFont("Fredoka", 600), loadFont("Figtree", 500)]);
  return [
    { name: "Fredoka", data: display, weight: 600 as const, style: "normal" as const },
    { name: "Figtree", data: body, weight: 500 as const, style: "normal" as const },
  ];
}

export function OgLockup() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
      <svg width="64" height="64" viewBox="0 0 100 100">
        <rect x="52" y="40" width="23" height="50" rx="11.5" fill={brand.violet} />
        <rect x="5" y="40" width="70" height="21" rx="10.5" fill={brand.violet} />
        <rect x="5" y="10" width="23" height="80" rx="11.5" fill={brand.coral} />
        <rect
          x="56"
          y="6"
          width="25"
          height="25"
          rx="8"
          fill={brand.mint}
          transform="rotate(22 68 19)"
        />
      </svg>
      <div style={{ display: "flex", fontFamily: "Fredoka", fontSize: 44 }}>
        headless&nbsp;<span style={{ color: brand.violet }}>lms</span>
      </div>
    </div>
  );
}

export const ogFrame = {
  width: "100%",
  height: "100%",
  display: "flex",
  flexDirection: "column",
  justifyContent: "space-between",
  padding: 64,
  backgroundColor: brand.paper,
  color: "#1c1d22",
  fontFamily: "Figtree",
} as const;
