import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";

// Next.js 16 renamed `middleware.ts` to `proxy.ts` (same runtime, same
// contract — see node_modules/next/dist/docs/.../proxy.md). This guards
// every route in the authenticated app shell, redirecting to /login when
// there is no session. Individual Server Actions still re-check the
// session themselves (see src/lib/tenant.ts) — proxy alone is not a
// substitute for that.
//
// Must live at src/proxy.ts, NOT the project root — this project uses a
// src/ directory (src/app/...), and Next.js requires proxy.ts (like
// middleware.ts before it) to sit next to `app`, not at the repo root.
// Root-level proxy.ts silently never runs; there is no error or warning.
export default auth((req) => {
  if (!req.auth) {
    const loginUrl = new URL("/login", req.nextUrl.origin);
    loginUrl.searchParams.set("callbackUrl", req.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }
});

export const config = {
  // manifest.webmanifest/icon/apple-icon/icon-192 are the PWA manifest +
  // icon routes (src/app/manifest.ts, icon.tsx, apple-icon.tsx,
  // icon-192/route.tsx) — a browser's install-prompt/home-screen fetch for
  // these has no session, and must get the actual asset, not a redirect to
  // an HTML login page.
  matcher: ["/((?!api|login|manifest.webmanifest|icon-192|icon|apple-icon|_next/static|_next/image|favicon.ico).*)"],
};
