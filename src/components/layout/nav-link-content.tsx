"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useLinkStatus } from "next/link";

// Don't dim on navigations that resolve almost instantly — only acknowledge
// the click once it's actually taking a moment, so fast nav doesn't flicker.
const SHOW_DELAY_MS = 150;

/**
 * Wraps a `<Link>`'s visual content (icon, label, badge) to give a subtle
 * "click registered" cue — reduced opacity — while that link's destination
 * is loading. `useLinkStatus` only works in a component rendered *inside*
 * the `<Link>` it reports on, hence this wrapper instead of reading status
 * from the sidebar/nav item itself. Takes over the flex layout the `<Link>`
 * used to own directly — the `<Link>` keeps only the outer box/color
 * classes (padding, radius, background, text transition-colors).
 */
export function NavLinkContent({ className, children }: { className: string; children: ReactNode }) {
  const { pending } = useLinkStatus();
  const [dim, setDim] = useState(false);

  useEffect(() => {
    if (!pending) {
      // Reset once the link's own navigation finishes (or never started
      // dimming yet) — not derived render state, so it can't be replaced by
      // a plain computation; this is the standard subscribe-to-an-external-
      // pending-flag-with-a-delay pattern.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDim(false);
      return;
    }
    const t = setTimeout(() => setDim(true), SHOW_DELAY_MS);
    return () => clearTimeout(t);
  }, [pending]);

  return <span className={`${className} transition-opacity ${dim ? "opacity-50" : ""}`}>{children}</span>;
}
