import { ImageResponse } from "next/og";

// Browser-tab favicon, generated at request time via the Next.js App Router
// "icon" convention (auto-linked as <link rel="icon">, no manifest wiring
// needed). Reuses the exact mark already used on the login screen/sidebar
// (charcoal rounded square + UtensilsCrossed in the accent-light color) so
// the app doesn't gain a second, invented identity.
export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
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
          borderRadius: 7,
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4FC3CE" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
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
