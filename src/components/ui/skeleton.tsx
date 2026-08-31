/**
 * Base building block for every route's `loading.tsx`. A plain pulsing
 * block in the same neutral tone used elsewhere for placeholders
 * (`bg-neutral-bg`) — each `loading.tsx` composes these into a layout that
 * echoes the real page (KPI cards, list rows, etc.) instead of a generic
 * spinner, so navigation doesn't feel like a freeze.
 */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-shimmer rounded-[8px] bg-neutral-bg ${className}`} />;
}
