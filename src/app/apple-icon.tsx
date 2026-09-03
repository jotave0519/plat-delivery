import { ImageResponse } from "next/og";

// iOS home-screen icon, generated via the App Router "apple-icon" convention
// (auto-linked as <link rel="apple-touch-icon">). No rounding here — iOS
// applies its own corner mask on top of whatever square is provided.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#14161b",
        }}
      >
        <svg width="96" height="96" viewBox="0 0 24 24" fill="none" stroke="#4FC3CE" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="m16 2-2.3 2.3a3 3 0 0 0 0 4.2l1.8 1.8a3 3 0 0 0 4.2 0L22 8" />
          <path d="M15 15 3.3 3.3a4.2 4.2 0 0 0 0 6L10 16v6" />
          <path d="M2.1 21.8 7 17" />
          <path d="m21.7 21.7-8.4-8.4" />
        </svg>
      </div>
    ),
    { ...size },
  );
}
