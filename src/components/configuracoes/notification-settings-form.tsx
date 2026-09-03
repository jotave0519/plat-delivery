"use client";

import { useState, useTransition } from "react";

import { saveNotificationSettings } from "@/server/actions/configuracoes";
import { useToast } from "@/components/ui/toast";

export function NotificationSettingsForm({ orderSoundEnabled }: { orderSoundEnabled: boolean }) {
  const [enabled, setEnabled] = useState(orderSoundEnabled);
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  function handleToggle(checked: boolean) {
    setEnabled(checked);
    startTransition(async () => {
      const result = await saveNotificationSettings({ orderSoundEnabled: checked });
      if (result?.error) {
        setEnabled(!checked);
        toast.error(result.error);
        return;
      }
      toast.success("Configurações de notificação salvas.");
    });
  }

  return (
    <label className="flex items-center justify-between gap-3 rounded-[13px] bg-neutral-bg px-4 py-3.5">
      <span className="flex flex-col gap-0.5">
        <span className="text-[13.5px] font-medium">🔔 Som de novos pedidos</span>
        <span className="text-[12px] text-faint">
          Toca um alerta sonoro curto quando um pedido novo chegar (WhatsApp ou manual), em qualquer tela.
        </span>
      </span>
      <input
        type="checkbox"
        checked={enabled}
        disabled={pending}
        onChange={(e) => handleToggle(e.target.checked)}
        className="h-5 w-5 flex-none accent-accent"
      />
    </label>
  );
}
