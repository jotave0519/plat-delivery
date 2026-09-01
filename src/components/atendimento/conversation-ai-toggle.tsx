"use client";

import { useTransition } from "react";
import { Loader2 } from "lucide-react";

import { setConversationAiEnabled } from "@/server/actions/atendimento";
import { useToast } from "@/components/ui/toast";

export function ConversationAiToggle({ conversationId, aiEnabled }: { conversationId: string; aiEnabled: boolean }) {
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  function toggle() {
    startTransition(async () => {
      const result = await setConversationAiEnabled(conversationId, !aiEnabled);
      if (result?.error) toast.error(result.error);
    });
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      className={`flex items-center gap-2 rounded-[10px] border px-3.5 py-2 text-[12.5px] font-medium transition-colors disabled:opacity-50 ${
        aiEnabled
          ? "border-border-strong text-muted hover:border-crit hover:text-crit"
          : "border-accent bg-accent-bg text-accent-hover"
      }`}
    >
      {pending ? <Loader2 className="h-[14px] w-[14px] animate-spin" /> : null}
      {aiEnabled ? "Assumir conversa (desligar IA)" : "Devolver conversa para a IA"}
    </button>
  );
}
