"use client";

import { useTransition } from "react";
import { Star, Loader2, CheckCheck, Eye, Phone } from "lucide-react";

import { markFeedbackViewed, markFeedbackResolved } from "@/server/actions/feedbacks";
import { useToast } from "@/components/ui/toast";
import { formatDateTimeHeader } from "@/lib/format";
import type { FeedbackListItem } from "@/server/queries/feedbacks";
import type { FeedbackStatus } from "@/generated/prisma";

const STATUS_LABEL: Record<FeedbackStatus, string> = {
  PENDING: "Agendado",
  SENDING: "Enviando…",
  SENT: "Aguardando resposta",
  RESPONDED: "Respondido",
  FAILED: "Falha no envio",
};

const STATUS_TONE: Record<FeedbackStatus, string> = {
  PENDING: "bg-neutral-bg text-neutral-icon",
  SENDING: "bg-neutral-bg text-neutral-icon",
  SENT: "bg-warn-bg text-warn-fg",
  RESPONDED: "bg-ok-bg text-ok-fg",
  FAILED: "bg-crit-bg text-crit-fg",
};

function FeedbackCard({ feedback }: { feedback: FeedbackListItem }) {
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  function handleMarkViewed() {
    startTransition(async () => {
      const result = await markFeedbackViewed(feedback.id);
      if (result?.error) toast.error(result.error);
    });
  }

  function handleMarkResolved() {
    startTransition(async () => {
      const result = await markFeedbackResolved(feedback.id);
      if (result?.error) toast.error(result.error);
    });
  }

  return (
    <div
      className={`flex flex-col gap-3 rounded-[18px] border p-4 ${
        feedback.isNew ? "border-accent bg-accent-bg/40" : "border-[#EDEFF3] bg-surface"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <span className="text-[15px] font-semibold tracking-tight">
              {feedback.customerName ?? "Cliente sem nome"}
            </span>
            {feedback.isNew ? (
              <span className="rounded-full bg-accent px-2 py-0.5 text-[10.5px] font-medium text-white">Novo</span>
            ) : null}
          </div>
          <span className="flex items-center gap-1.5 text-[12px] text-faint">
            <Phone className="h-[12px] w-[12px]" />
            {feedback.phoneNumber} · Pedido #{feedback.orderNumber}
          </span>
        </div>
        <span className={`flex-none rounded-full px-2.5 py-1 text-[11.5px] font-medium ${STATUS_TONE[feedback.status]}`}>
          {STATUS_LABEL[feedback.status]}
        </span>
      </div>

      {feedback.responseText ? (
        <div className="flex flex-col gap-1.5 rounded-[13px] bg-neutral-bg px-3.5 py-3">
          <p className="text-[13.5px] text-ink">{feedback.responseText}</p>
          <div className="flex items-center gap-3 text-[11.5px] text-faint">
            {feedback.responseReceivedAt ? <span>{formatDateTimeHeader(feedback.responseReceivedAt)}</span> : null}
            {feedback.rating != null ? (
              <span className="flex items-center gap-1 font-medium text-warn-fg">
                <Star className="h-[13px] w-[13px] fill-current" />
                {feedback.rating}/10
              </span>
            ) : null}
          </div>
        </div>
      ) : (
        <p className="text-[13px] text-faint">
          {feedback.status === "SENT"
            ? "Mensagem enviada — aguardando o cliente responder."
            : feedback.status === "FAILED"
              ? "Não foi possível enviar a mensagem de feedback."
              : "Ainda não foi enviado."}
        </p>
      )}

      <div className="flex items-center gap-2 border-t border-border-soft pt-3">
        {feedback.isNew ? (
          <button
            type="button"
            onClick={handleMarkViewed}
            disabled={pending}
            className="flex items-center gap-1.5 rounded-[9px] border border-border-strong px-3 py-1.5 text-[12.5px] font-medium text-muted transition-colors hover:border-accent hover:text-accent-hover disabled:opacity-50"
          >
            {pending ? <Loader2 className="h-[13px] w-[13px] animate-spin" /> : <Eye className="h-[13px] w-[13px]" />}
            Marcar como visto
          </button>
        ) : null}
        {!feedback.resolvedAt ? (
          <button
            type="button"
            onClick={handleMarkResolved}
            disabled={pending}
            className="flex items-center gap-1.5 rounded-[9px] border border-border-strong px-3 py-1.5 text-[12.5px] font-medium text-muted transition-colors hover:border-ok hover:text-ok-fg disabled:opacity-50"
          >
            {pending ? <Loader2 className="h-[13px] w-[13px] animate-spin" /> : <CheckCheck className="h-[13px] w-[13px]" />}
            Marcar como resolvido
          </button>
        ) : (
          <span className="flex items-center gap-1.5 text-[12px] font-medium text-ok-fg">
            <CheckCheck className="h-[13px] w-[13px]" />
            Resolvido
          </span>
        )}
      </div>
    </div>
  );
}

export function FeedbackList({ feedbacks }: { feedbacks: FeedbackListItem[] }) {
  if (feedbacks.length === 0) {
    return (
      <div className="flex flex-col items-center gap-1.5 rounded-[18px] border border-dashed border-border-strong py-14 text-center">
        <span className="text-[14px] font-medium text-muted">Nenhum feedback ainda</span>
        <span className="max-w-sm text-[12.5px] text-faint">
          Assim que um pedido do WhatsApp for concluído, o pedido de feedback é agendado automaticamente para ~3h depois.
        </span>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {feedbacks.map((f) => (
        <FeedbackCard key={f.id} feedback={f} />
      ))}
    </div>
  );
}
