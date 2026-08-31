"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Image from "next/image";
import { Smartphone, Loader2, TriangleAlert } from "lucide-react";

import { connectWhatsapp, disconnectWhatsapp, refreshConnectionStatus } from "@/server/actions/atendimento";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { TONE_CLASSES } from "@/lib/order-flow";
import { minutesAgo, formatElapsed } from "@/lib/format";

type ConnectionStatus = "DISCONNECTED" | "CONNECTING" | "CONNECTED" | "ERROR";

type ConnectionState = {
  status: ConnectionStatus;
  qrCode: string | null;
  phoneNumber: string | null;
  lastEventAt: Date | null;
};

const STATUS_LABEL: Record<ConnectionStatus, string> = {
  DISCONNECTED: "Desconectado",
  CONNECTING: "Aguardando leitura do QR code",
  CONNECTED: "Conectado",
  ERROR: "Erro na conexão",
};

const STATUS_TONE = {
  DISCONNECTED: TONE_CLASSES.neutral,
  CONNECTING: TONE_CLASSES.warn,
  CONNECTED: TONE_CLASSES.ok,
  ERROR: TONE_CLASSES.crit,
} as const;

export function WhatsappConnectionCard({ initial }: { initial: ConnectionState | null }) {
  const [state, setState] = useState<ConnectionState>(
    initial ?? { status: "DISCONNECTED", qrCode: null, phoneNumber: null, lastEventAt: null },
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (state.status !== "CONNECTING") {
      if (pollRef.current) clearInterval(pollRef.current);
      return;
    }
    pollRef.current = setInterval(async () => {
      const fresh = await refreshConnectionStatus();
      if (fresh) setState(fresh);
    }, 3000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [state.status]);

  function handleConnect() {
    setError(null);
    startTransition(async () => {
      const result = await connectWhatsapp();
      if (result?.error) {
        setError(result.error);
        return;
      }
      const fresh = await refreshConnectionStatus();
      if (fresh) setState(fresh);
    });
  }

  const tone = STATUS_TONE[state.status];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <div className={`grid h-10 w-10 flex-none place-items-center rounded-[12px] ${tone.bg}`}>
          <Smartphone className={`h-[18px] w-[18px] ${tone.icon}`} />
        </div>
        <div className="flex flex-col gap-0.5">
          <span className={`text-[13.5px] font-semibold ${tone.fg}`}>{STATUS_LABEL[state.status]}</span>
          {state.status === "CONNECTED" && state.phoneNumber ? (
            <span className="text-[12.5px] text-faint">{state.phoneNumber}</span>
          ) : null}
          {state.lastEventAt ? (
            <span className="text-[11.5px] text-faint">
              Última atualização há {formatElapsed(minutesAgo(new Date(state.lastEventAt)))}
            </span>
          ) : null}
        </div>
      </div>

      {state.status === "CONNECTING" && state.qrCode ? (
        <div className="flex flex-col items-center gap-2 rounded-[16px] border border-dashed border-border-strong p-5">
          <Image
            src={state.qrCode.startsWith("data:") ? state.qrCode : `data:image/png;base64,${state.qrCode}`}
            alt="QR code para conectar o WhatsApp"
            width={220}
            height={220}
            unoptimized
            className="rounded-[10px]"
          />
          <p className="text-center text-[12.5px] text-faint">
            Abra o WhatsApp no celular do restaurante → Aparelhos conectados → Conectar um aparelho, e escaneie o
            código acima.
          </p>
        </div>
      ) : null}

      {error ? (
        <div className="flex items-center gap-2 rounded-[10px] bg-crit-bg px-3 py-2 text-[12.5px] text-crit-fg">
          <TriangleAlert className="h-[14px] w-[14px] flex-none" />
          {error}
        </div>
      ) : null}

      <div className="flex items-center gap-2">
        {state.status !== "CONNECTED" ? (
          <button
            type="button"
            onClick={handleConnect}
            disabled={pending}
            className="flex items-center gap-2 rounded-[10px] bg-accent px-3.5 py-2 text-[12.5px] font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-60"
          >
            {pending ? <Loader2 className="h-[14px] w-[14px] animate-spin" /> : null}
            {state.status === "CONNECTING" ? "Gerar novo QR code" : "Conectar WhatsApp"}
          </button>
        ) : null}

        {state.status !== "DISCONNECTED" ? (
          <ConfirmButton
            action={disconnectWhatsapp}
            confirmMessage={
              state.status === "CONNECTED"
                ? "Desconectar o WhatsApp deste restaurante?"
                : "Cancelar a conexão e remover esta instância?"
            }
            label={state.status === "CONNECTED" ? "Desconectar" : "Cancelar"}
            className="flex items-center gap-2 rounded-[10px] border border-border-strong px-3.5 py-2 text-[12.5px] font-medium text-muted transition-colors hover:border-crit hover:text-crit"
          />
        ) : null}
      </div>
    </div>
  );
}
