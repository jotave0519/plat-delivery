"use client";

import { useState, useTransition } from "react";
import { Phone, Loader2 } from "lucide-react";

import { connectPhoneAgent, disconnectPhoneAgent, savePhoneAgentNumbers } from "@/server/actions/telefonia";
import type { PhoneAgentSettings } from "@/server/queries/telefonia";
import { TONE_CLASSES } from "@/lib/order-flow";
import { useToast } from "@/components/ui/toast";

const inputClass =
  "rounded-[11px] border border-border-strong bg-surface px-3.5 py-2.5 text-sm text-ink outline-none transition-colors placeholder:text-faint focus:border-accent";

export function PhoneAgentSettingsForm({ settings }: { settings: PhoneAgentSettings }) {
  const [twilioNumber, setTwilioNumber] = useState(settings.twilioNumber ?? "");
  const [humanTransferNumber, setHumanTransferNumber] = useState(settings.humanTransferNumber ?? "");
  const [pendingToggle, startToggleTransition] = useTransition();
  const [pendingSave, startSaveTransition] = useTransition();
  const toast = useToast();

  const tone = settings.enabled ? TONE_CLASSES.ok : TONE_CLASSES.neutral;

  function handleToggle() {
    startToggleTransition(async () => {
      const result = settings.enabled ? await disconnectPhoneAgent() : await connectPhoneAgent();
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      toast.success(settings.enabled ? "Recepcionista por telefone desativada." : "Recepcionista por telefone ativada.");
    });
  }

  function handleSaveNumbers(e: React.FormEvent) {
    e.preventDefault();
    startSaveTransition(async () => {
      const result = await savePhoneAgentNumbers({ twilioNumber, humanTransferNumber });
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Números salvos.");
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <div className={`grid h-10 w-10 flex-none place-items-center rounded-[12px] ${tone.bg}`}>
          <Phone className={`h-[18px] w-[18px] ${tone.icon}`} />
        </div>
        <div className="flex flex-col gap-0.5">
          <span className={`text-[13.5px] font-semibold ${tone.fg}`}>{settings.enabled ? "Ativada" : "Desativada"}</span>
          <span className="text-[12px] text-faint">
            {settings.enabled ? "Atendendo ligações automaticamente." : "Ligações não são atendidas pela IA no momento."}
          </span>
        </div>
        <button
          type="button"
          onClick={handleToggle}
          disabled={pendingToggle}
          className={`ml-auto flex items-center gap-2 rounded-[10px] px-3.5 py-2 text-[12.5px] font-medium transition-colors disabled:opacity-60 ${
            settings.enabled
              ? "border border-border-strong text-muted hover:border-crit hover:text-crit"
              : "bg-accent text-white hover:bg-accent-hover"
          }`}
        >
          {pendingToggle ? <Loader2 className="h-[14px] w-[14px] animate-spin" /> : null}
          {settings.enabled ? "Desativar" : "Ativar recepcionista"}
        </button>
      </div>

      <form onSubmit={handleSaveNumbers} className="flex flex-col gap-3 border-t border-border-soft pt-3.5">
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-muted">Número de telefone (Twilio, formato internacional)</span>
          <input
            className={inputClass}
            value={twilioNumber}
            onChange={(e) => setTwilioNumber(e.target.value)}
            placeholder="+55 11 4000-0000"
          />
          <span className="text-[11.5px] text-faint">
            Precisa estar vinculado ao agente diretamente no painel da ElevenLabs (Telephony → Import number) — a
            plataforma não faz essa vinculação sozinha.
          </span>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-muted">Telefone da equipe para transferência</span>
          <input
            className={inputClass}
            value={humanTransferNumber}
            onChange={(e) => setHumanTransferNumber(e.target.value)}
            placeholder="+55 11 90000-0000"
          />
          <span className="text-[11.5px] text-faint">Para onde a IA transfere a ligação quando o cliente pede para falar com uma pessoa.</span>
        </label>

        <div>
          <button
            type="submit"
            disabled={pendingSave}
            className="flex min-h-[40px] items-center justify-center rounded-[10px] bg-charcoal px-5 text-[13.5px] font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
          >
            {pendingSave ? "Salvando…" : "Salvar números"}
          </button>
        </div>
      </form>
    </div>
  );
}
