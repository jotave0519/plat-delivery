"use client";

import { useState, useTransition } from "react";
import { Loader2, MessageSquare } from "lucide-react";

import { saveWhatsappAgentDomain } from "@/server/actions/whatsapp-domain";
import { useToast } from "@/components/ui/toast";
import type { WhatsappAgentDomain } from "@/generated/prisma";

const OPTIONS: { value: WhatsappAgentDomain; label: string; description: string }[] = [
  { value: "PEDIDO", label: "Pedidos (cardápio)", description: "O WhatsApp atende o cliente montando um pedido do cardápio." },
  { value: "DESPACHO", label: "Despacho residencial", description: "O WhatsApp coleta o problema e despacha um técnico disponível." },
  { value: "ORCAMENTO", label: "Orçamento automático", description: "O WhatsApp coleta dados e calcula um orçamento automaticamente." },
  { value: "LOCACAO", label: "Locação imobiliária", description: "O WhatsApp agenda visitas a imóveis e coleta documentação do candidato." },
];

/**
 * The one selector shared by PEDIDO/DESPACHO/ORCAMENTO/LOCACAO — mutually exclusive
 * by construction (Restaurant.whatsappAgentDomain), so it lives in its own
 * section rather than duplicated as a toggle inside each agent's settings.
 */
export function WhatsappDomainSettingsForm({ current }: { current: WhatsappAgentDomain }) {
  const [domain, setDomain] = useState(current);
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  function handleChange(next: WhatsappAgentDomain) {
    setDomain(next);
    startTransition(async () => {
      const result = await saveWhatsappAgentDomain(next);
      if (result?.error) {
        toast.error(result.error);
        setDomain(current);
        return;
      }
      toast.success("Modo do WhatsApp atualizado.");
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 text-[12.5px] text-faint">
        <MessageSquare className="h-[14px] w-[14px]" />
        Só um modo pode estar ativo por vez.
        {pending ? <Loader2 className="h-[13px] w-[13px] animate-spin" /> : null}
      </div>
      <div className="flex flex-col gap-2">
        {OPTIONS.map((opt) => (
          <label
            key={opt.value}
            className={`flex cursor-pointer items-start gap-3 rounded-[13px] border px-3.5 py-3 transition-colors ${
              domain === opt.value ? "border-accent bg-accent-bg/40" : "border-border-soft hover:border-border-strong"
            }`}
          >
            <input
              type="radio"
              name="whatsappAgentDomain"
              checked={domain === opt.value}
              onChange={() => handleChange(opt.value)}
              disabled={pending}
              className="mt-1"
            />
            <div className="flex flex-col gap-0.5">
              <span className="text-[13.5px] font-medium">{opt.label}</span>
              <span className="text-[12px] text-faint">{opt.description}</span>
            </div>
          </label>
        ))}
      </div>
    </div>
  );
}
