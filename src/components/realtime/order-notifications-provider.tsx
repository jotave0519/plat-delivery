"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { useToast } from "@/components/ui/toast";
import { unlockAudio, playNewOrderChime } from "@/lib/notification-sound";
import type { NewOrderEvent } from "@/server/realtime/order-events";

/**
 * Real-time "new order" notifications — mounted once in the authenticated
 * layout (src/app/(app)/layout.tsx), so it's active no matter which section
 * the user is in. Connects to /api/realtime/orders via the browser's native
 * EventSource (reconnects and resends Last-Event-ID on its own — no manual
 * reconnect logic needed here). On each event: refreshes the current
 * route's Server Components (router.refresh() — this is what updates the
 * Dashboard/Pedidos/sidebar badges, since they all read straight from the
 * database), shows a toast, plays the chime, flashes the tab title if it's
 * not the focused tab, and marks the order "recent" for a few seconds so
 * order cards can render a brief highlight (see useIsRecentOrder below).
 */

const HIGHLIGHT_MS = 6000;

type RecentOrdersContextValue = { isRecent: (orderId: string) => boolean };
const RecentOrdersContext = createContext<RecentOrdersContextValue>({ isRecent: () => false });

/** True for a few seconds right after a given order arrives via the real-time stream — used to briefly highlight its card. */
export function useIsRecentOrder(orderId: string): boolean {
  const { isRecent } = useContext(RecentOrdersContext);
  return isRecent(orderId);
}

export function OrderNotificationsProvider({ soundEnabled, children }: { soundEnabled: boolean; children: ReactNode }) {
  const router = useRouter();
  const toast = useToast();
  const [recentIds, setRecentIds] = useState<Set<string>>(new Set());
  const soundEnabledRef = useRef(soundEnabled);

  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
  }, [soundEnabled]);

  useEffect(() => {
    // Unlock audio on the first real interaction anywhere on the page —
    // browsers refuse to play sound before one. Attached once; removes
    // itself after firing.
    function handleFirstInteraction() {
      unlockAudio();
      window.removeEventListener("pointerdown", handleFirstInteraction);
      window.removeEventListener("keydown", handleFirstInteraction);
    }
    window.addEventListener("pointerdown", handleFirstInteraction);
    window.addEventListener("keydown", handleFirstInteraction);
    return () => {
      window.removeEventListener("pointerdown", handleFirstInteraction);
      window.removeEventListener("keydown", handleFirstInteraction);
    };
  }, []);

  useEffect(() => {
    const eventSource = new EventSource("/api/realtime/orders");

    eventSource.addEventListener("new-order", (rawEvent) => {
      const event = JSON.parse((rawEvent as MessageEvent).data) as NewOrderEvent;

      setRecentIds((current) => {
        const next = new Set(current);
        next.add(event.id);
        return next;
      });
      setTimeout(() => {
        setRecentIds((current) => {
          const next = new Set(current);
          next.delete(event.id);
          return next;
        });
      }, HIGHLIGHT_MS);

      router.refresh();
      toast.info(`Novo pedido #${event.number} recebido!`);
      if (soundEnabledRef.current) playNewOrderChime();
      if (document.visibilityState !== "visible") flashTitle();
    });

    return () => eventSource.close();
    // toast/router identities are stable enough for this app's usage — this
    // effect is meant to run exactly once per mount (one connection per tab).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <RecentOrdersContext.Provider value={{ isRecent: (id) => recentIds.has(id) }}>{children}</RecentOrdersContext.Provider>;
}

let titleFlashInterval: ReturnType<typeof setInterval> | null = null;
let originalTitle: string | null = null;

function flashTitle() {
  if (originalTitle === null) originalTitle = document.title;
  if (titleFlashInterval) return; // already flashing

  let showingAlert = false;
  titleFlashInterval = setInterval(() => {
    showingAlert = !showingAlert;
    document.title = showingAlert ? "🔔 Novo pedido!" : (originalTitle ?? document.title);
  }, 1200);

  const stop = () => {
    if (titleFlashInterval) clearInterval(titleFlashInterval);
    titleFlashInterval = null;
    if (originalTitle !== null) document.title = originalTitle;
    document.removeEventListener("visibilitychange", onVisible);
  };
  function onVisible() {
    if (document.visibilityState === "visible") stop();
  }
  document.addEventListener("visibilitychange", onVisible);
}
