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
        backgroundColor: brand.ink,
      }}
    >
      <svg width="112" height="112" viewBox="0 0 100 100" fill={brand.paper}>
        <g transform="translate(10 4)">
          <rect x="52" y="40" width="23" height="50" rx="11.5" />
          <rect x="5" y="40" width="70" height="21" rx="10.5" />
          <rect x="5" y="2" width="23" height="88" rx="11.5" />
          <rect x="52" y="2" width="23" height="23" rx="8" />
        </g>
      </svg>
    </div>,
    size,
  );
}
