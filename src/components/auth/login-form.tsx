"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";

import { loginAction } from "@/server/actions/auth";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-[11px] bg-charcoal text-sm font-medium text-white transition-colors hover:bg-accent-hover active:scale-[0.98] disabled:opacity-60"
    >
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      {pending ? "Entrando…" : "Entrar"}
    </button>
  );
}

export function LoginForm({ callbackUrl }: { callbackUrl?: string }) {
  const [error, formAction] = useActionState(loginAction, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {callbackUrl ? <input type="hidden" name="callbackUrl" value={callbackUrl} /> : null}
      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium text-muted">E-mail</span>
        <input
          name="email"
          type="email"
          required
          autoFocus
          autoComplete="email"
          placeholder="voce@seurestaurante.com.br"
          className="rounded-[11px] border border-border-strong bg-surface px-3.5 py-2.5 text-sm text-ink outline-none transition-colors placeholder:text-faint focus:border-accent"
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium text-muted">Senha</span>
        <input
          name="password"
          type="password"
          required
          autoComplete="current-password"
          placeholder="••••••••"
          className="rounded-[11px] border border-border-strong bg-surface px-3.5 py-2.5 text-sm text-ink outline-none transition-colors placeholder:text-faint focus:border-accent"
        />
      </label>

      {error ? (
        <p className="rounded-[10px] bg-crit-bg px-3 py-2 text-[13px] text-crit-fg">{error}</p>
      ) : null}

      <SubmitButton />
    </form>
  );
}
