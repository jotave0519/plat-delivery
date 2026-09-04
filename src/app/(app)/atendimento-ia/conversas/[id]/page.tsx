import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Lock } from "lucide-react";

import { getTenant } from "@/lib/tenant";
import { getConversation } from "@/server/queries/atendimento";
import { ConversationAiToggle } from "@/components/atendimento/conversation-ai-toggle";

function formatDateTime(date: Date) {
  return new Date(date).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default async function ConversationDetailPage(props: PageProps<"/atendimento-ia/conversas/[id]">) {
  const { id } = await props.params;
  const tenant = await getTenant();
  const canAccess = tenant.role === "OWNER" || tenant.role === "ADMIN";

  if (!canAccess) {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center gap-3 px-6 text-center">
        <div className="grid h-11 w-11 place-items-center rounded-[13px] bg-neutral-bg text-neutral-icon">
          <Lock className="h-5 w-5" />
        </div>
        <h1 className="text-[21px] font-semibold tracking-tight">Acesso restrito</h1>
      </div>
    );
  }

  const conversation = await getConversation(tenant.restaurantId, id);
  if (!conversation) notFound();

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5 px-[clamp(18px,2.4vw,34px)] py-7 pb-16">
      <Link href="/atendimento-ia" className="flex items-center gap-1.5 text-[13px] font-medium text-muted hover:text-ink">
        <ArrowLeft className="h-[14px] w-[14px]" />
        Atendimento IA
      </Link>

      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-[20px] font-semibold tracking-tight">
            {conversation.customerName ?? conversation.contactName ?? conversation.phoneNumber}
          </h1>
          <p className="text-[13px] text-faint">{conversation.phoneNumber}</p>
        </div>
        <div className="flex flex-none flex-col items-end gap-1.5">
          {conversation.handoffState === "HUMANO_ATIVO" ? (
            <span className="rounded-full bg-warn-bg px-2.5 py-1 text-[11px] font-medium text-warn-fg">Atendimento humano ativo</span>
          ) : conversation.handoffState === "HUMANO_EXPIRADO" ? (
            <span className="rounded-full bg-neutral-bg px-2.5 py-1 text-[11px] font-medium text-neutral-fg">
              Sem atividade há +2h — a IA volta na próxima mensagem
            </span>
          ) : null}
          <ConversationAiToggle conversationId={conversation.id} aiEnabled={conversation.aiEnabled} />
        </div>
      </div>

      <div className="flex flex-col gap-2.5 rounded-[20px] border border-border bg-surface p-5">
        {conversation.messages.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-faint">Nenhuma mensagem ainda.</p>
        ) : (
          conversation.messages.map((m) => (
            <div key={m.id} className={`flex ${m.direction === "OUT" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[80%] rounded-[14px] px-3.5 py-2.5 text-[13.5px] ${
                  m.direction === "OUT" ? "bg-charcoal text-white" : "bg-neutral-bg text-ink"
                }`}
              >
                <p className="whitespace-pre-wrap">{m.content}</p>
                <span className={`mt-1 block text-[10.5px] ${m.direction === "OUT" ? "text-white/60" : "text-faint"}`}>
                  {formatDateTime(m.createdAt)}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
