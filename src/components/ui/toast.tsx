"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { CheckCircle2, XCircle, Bell } from "lucide-react";

type ToastItem = { id: number; type: "success" | "error" | "info"; message: string };
type ToastApi = { success: (message: string) => void; error: (message: string) => void; info: (message: string) => void };

const ToastContext = createContext<ToastApi | null>(null);

/** Call after a Server Action resolves — replaces the native `alert()` used for errors and the "nothing happens" silence used for success. */
export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast precisa estar dentro de <ToastProvider>.");
  return ctx;
}

const TOAST_DURATION_MS = 3500;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const push = useCallback((type: ToastItem["type"], message: string) => {
    const id = Date.now() + Math.random();
    setToasts((current) => [...current, { id, type, message }]);
    setTimeout(() => setToasts((current) => current.filter((t) => t.id !== id)), TOAST_DURATION_MS);
  }, []);

  const api: ToastApi = {
    success: (message) => push("success", message),
    error: (message) => push("error", message),
    info: (message) => push("info", message),
  };

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed inset-x-4 bottom-[calc(4.5rem+var(--safe-bottom))] z-50 flex flex-col items-end gap-2 md:inset-x-auto md:right-5 md:bottom-5">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`animate-rise-in pointer-events-auto flex max-w-[340px] items-center gap-2.5 rounded-[13px] border border-border bg-surface px-4 py-3 text-[13px] font-medium text-ink shadow-[0_14px_30px_-14px_rgba(26,29,35,.35)] ${
              t.type === "success" ? "bg-ok-bg" : t.type === "error" ? "bg-crit-bg" : "bg-accent-bg"
            }`}
          >
            {t.type === "success" ? (
              <CheckCircle2 className="h-[16px] w-[16px] flex-none text-ok" />
            ) : t.type === "error" ? (
              <XCircle className="h-[16px] w-[16px] flex-none text-crit" />
            ) : (
              <Bell className="h-[16px] w-[16px] flex-none text-accent" />
            )}
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
