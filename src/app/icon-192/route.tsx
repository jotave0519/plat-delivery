import { ImageResponse } from "next/og";

// Larger icon used only by manifest.ts (Android install prompt/home-screen
// icon) — not part of the "icon"/"apple-icon" file conventions, so it's a
// plain image-generating route instead. Same mark as icon.tsx/apple-icon.tsx,
// just bigger and with rounded corners (Android renders its own mask too,
// but a rounded source looks right for the "any" purpose icon).
export async function GET() {
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
          borderRadius: 40,
        }}
      >
        <svg width="104" height="104" viewBox="0 0 24 24" fill="none" stroke="#4FC3CE" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="m16 2-2.3 2.3a3 3 0 0 0 0 4.2l1.8 1.8a3 3 0 0 0 4.2 0L22 8" />
          <path d="M15 15 3.3 3.3a4.2 4.2 0 0 0 0 6L10 16v6" />
          <path d="M2.1 21.8 7 17" />
          <path d="m21.7 21.7-8.4-8.4" />
        </svg>
      </div>
    ),
    { width: 192, height: 192 },
  );
}
