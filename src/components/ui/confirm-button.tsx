"use client";

import { useTransition, type ReactNode } from "react";
import { Loader2 } from "lucide-react";

import { useToast } from "@/components/ui/toast";

type ActionResult = { error?: string } | void | undefined;

/**
 * Generic "confirm, then run a Server Action" button — the pattern first
 * used for cancelling an order (src/components/pedidos/cancel-order-button.tsx),
 * generalized so delete actions elsewhere don't each reimplement it. Works
 * directly with our Server Actions' usual `{ error?: string } | void`
 * return shape — shows an alert on error instead of leaving it unhandled.
 *
 * `icon` takes an already-rendered element (`<Trash2 .../>`), not a
 * component reference — a bare component type isn't serializable when this
 * button is used from a Server Component parent (as on /clientes/[id]).
 */
export function ConfirmButton({
  action,
  confirmMessage,
  label,
  icon,
  className,
  disabled,
  title,
}: {
  action: () => Promise<ActionResult> | ActionResult;
  confirmMessage: string;
  label?: string;
  icon?: ReactNode;
  className?: string;
  disabled?: boolean;
  /** Overrides the tooltip shown (defaults to `label`) — useful for icon-only buttons that need to explain a disabled state. */
  title?: string;
}) {
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  function handleClick() {
    if (!confirm(confirmMessage)) return;
    startTransition(async () => {
      const result = await action();
      if (result?.error) toast.error(result.error);
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled || pending}
      className={className}
      title={title ?? label}
    >
      {pending ? <Loader2 className="h-[14px] w-[14px] animate-spin" /> : icon}
      {label ? <span>{label}</span> : null}
    </button>
  );
}
