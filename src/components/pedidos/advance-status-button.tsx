"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";

/**
 * Submit button for the "advance to next status" `<form action={...}>` on
 * both the dashboard order card and the order detail page — the single
 * most-clicked action in the app, previously with zero pending feedback.
 * `useFormStatus` only works in a component rendered *inside* the `<form>`,
 * not the component that renders the form itself — hence this small client
 * wrapper instead of converting the whole card/page to a client component.
 *
 * `icon` takes an already-rendered element, not a component reference —
 * same RSC-serialization rule as `ConfirmButton` (see its own comment).
 */
export function AdvanceStatusButton({ label, icon, className }: { label: string; icon?: ReactNode; className?: string }) {
  const { pending } = useFormStatus();

  return (
    <button type="submit" disabled={pending} className={className}>
      {pending ? <Loader2 className="h-[15px] w-[15px] animate-spin" /> : icon}
      {label}
    </button>
  );
}
