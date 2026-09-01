"use client";

import { useState, useTransition } from "react";

import { saveAiSettings } from "@/server/actions/configuracoes";
import type { AiSettings } from "@/server/queries/configuracoes";
import type { PaymentMethod } from "@/generated/prisma";
import { PAYMENT_METHOD_LABELS } from "@/lib/order-flow";
import { useToast } from "@/components/ui/toast";

const inputClass =
  "rounded-[11px] border border-border-strong bg-surface px-3.5 py-2.5 text-sm text-ink outline-none transition-colors placeholder:text-faint focus:border-accent";

const ALL_PAYMENT_METHODS: PaymentMethod[] = ["PIX", "CARTAO", "DINHEIRO", "VALE_REFEICAO"];

export function AiSettingsForm({ settings }: { settings: AiSettings }) {
  const [aiEnabled, setAiEnabled] = useState(settings.aiEnabled);
  const [faqText, setFaqText] = useState(settings.faqText ?? "");
  const [deliveryAreasText, setDeliveryAreasText] = useState(settings.deliveryAreasText ?? "");
  const [defaultDeliveryFee, setDefaultDeliveryFee] = useState(
    settings.defaultDeliveryFee != null ? String(settings.defaultDeliveryFee) : "",
  );
  const [methods, setMethods] = useState<PaymentMethod[]>(settings.acceptedPaymentMethods);
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  function toggleMethod(m: PaymentMethod) {
    setMethods((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await saveAiSettings({
        aiEnabled,
        faqText,
        deliveryAreasText,
        defaultDeliveryFee: defaultDeliveryFee.trim() ? Number(defaultDeliveryFee.replace(",", ".")) : undefined,
        acceptedPaymentMethods: methods,
      });
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Configurações da IA salvas.");
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <label className="flex items-center justify-between gap-3 rounded-[13px] bg-neutral-bg px-4 py-3.5">
        <span className="flex flex-col gap-0.5">
          <span className="text-[13.5px] font-medium">Atendimento por IA ativado</span>
          <span className="text-[12px] text-faint">
            Enquanto desligado, o WhatsApp continua conectado normalmente, mas nenhuma resposta automática é enviada.
          </span>
        </span>
        <input
          type="checkbox"
          checked={aiEnabled}
          onChange={(e) => setAiEnabled(e.target.checked)}
          className="h-5 w-5 flex-none accent-accent"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium text-muted">Formas de pagamento aceitas pelo WhatsApp</span>
        <div className="flex flex-wrap gap-2">
          {ALL_PAYMENT_METHODS.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => toggleMethod(m)}
              className={`rounded-[9px] border px-3 py-1.5 text-[12.5px] font-medium transition-colors ${
                methods.includes(m)
                  ? "border-accent bg-accent-bg text-accent-hover"
                  : "border-border-strong text-muted hover:border-accent"
              }`}
            >
              {PAYMENT_METHOD_LABELS[m]}
            </button>
          ))}
        </div>
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium text-muted">Taxa de entrega padrão (usada pela IA ao montar o pedido)</span>
        <input
          className={inputClass}
          value={defaultDeliveryFee}
          onChange={(e) => setDefaultDeliveryFee(e.target.value)}
          placeholder="0,00"
          inputMode="decimal"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium text-muted">Áreas de entrega (texto livre — a IA usa isso para responder, sem bloquear pedidos)</span>
        <textarea
          className={`${inputClass} min-h-[70px] resize-y`}
          value={deliveryAreasText}
          onChange={(e) => setDeliveryAreasText(e.target.value)}
          placeholder="Ex.: Entregamos em todo o bairro Centro e regiões próximas em até 5 km."
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium text-muted">Perguntas frequentes / informações do negócio</span>
        <textarea
          className={`${inputClass} min-h-[100px] resize-y`}
          value={faqText}
          onChange={(e) => setFaqText(e.target.value)}
          placeholder={"Ex.: Aceitamos pedidos com no mínimo R$ 20.\nTemos opções vegetarianas.\nEstacionamento gratuito no local."}
        />
      </label>

      <div>
        <button
          type="submit"
          disabled={pending}
          className="flex min-h-[40px] items-center justify-center rounded-[10px] bg-charcoal px-5 text-[13.5px] font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
        >
          {pending ? "Salvando…" : "Salvar"}
        </button>
      </div>
    </form>
  );
}
