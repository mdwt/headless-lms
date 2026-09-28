import { ImageResponse } from "next/og";

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
        backgroundColor: "#171512",
      }}
    >
      <svg width="120" height="120" viewBox="0 0 24 24" fill="none">
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
    </div>,
    size,
  );
}
