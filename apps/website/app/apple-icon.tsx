import { ImageResponse } from "next/og";
import { brand } from "@/components/logo";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: brand.paper,
      }}
    >
      <svg width="132" height="132" viewBox="0 0 100 100">
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
    </div>,
    size,
  );
}
