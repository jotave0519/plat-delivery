import { Lock } from "lucide-react";

import { getTenant } from "@/lib/tenant";
import { getWhatsappConnection, listConversations } from "@/server/queries/atendimento";
import { getAiSettings } from "@/server/queries/configuracoes";
import { WhatsappConnectionCard } from "@/components/atendimento/whatsapp-connection-card";
import { ConversationsList } from "@/components/atendimento/conversations-list";
import { AiSettingsForm } from "@/components/configuracoes/ai-settings-form";
import { MenuPdfForm } from "@/components/configuracoes/menu-pdf-form";

export default async function AtendimentoIaPage() {
  const tenant = await getTenant();
  const canAccess = tenant.role === "OWNER" || tenant.role === "ADMIN";

  if (!canAccess) {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center gap-3 px-6 text-center">
        <div className="grid h-11 w-11 place-items-center rounded-[13px] bg-neutral-bg text-neutral-icon">
          <Lock className="h-5 w-5" />
        </div>
        <h1 className="text-[21px] font-semibold tracking-tight">Acesso restrito</h1>
        <p className="max-w-sm text-[13.5px] text-muted">
          A conexão do WhatsApp é visível apenas para proprietários e administradores.
        </p>
      </div>
    );
  }

  const [connection, aiSettings, conversations] = await Promise.all([
    getWhatsappConnection(tenant.restaurantId),
    getAiSettings(tenant.restaurantId),
    listConversations(tenant.restaurantId),
  ]);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5 px-[clamp(18px,2.4vw,34px)] py-7 pb-16">
      <div className="flex flex-col gap-1">
        <h1 className="text-[22px] font-semibold tracking-tight">Atendimento IA</h1>
        <p className="text-[13px] text-faint">
          Conexão com o WhatsApp, configuração do agente de atendimento automático e acompanhamento das conversas.
        </p>
      </div>

      <section className="flex flex-col gap-3.5 rounded-[20px] border border-border bg-surface p-5">
        <h2 className="text-[15px] font-semibold tracking-tight">Conexão com o WhatsApp</h2>
        <WhatsappConnectionCard
          initial={
            connection
              ? {
                  status: connection.status,
                  qrCode: connection.qrCode,
                  phoneNumber: connection.phoneNumber,
                  lastEventAt: connection.lastEventAt,
                }
              : null
          }
        />
      </section>

      <section className="flex flex-col gap-3.5 rounded-[20px] border border-border bg-surface p-5">
        <h2 className="text-[15px] font-semibold tracking-tight">Configurações da IA</h2>
        <AiSettingsForm settings={aiSettings} />
      </section>

      <section className="flex flex-col gap-3.5 rounded-[20px] border border-border bg-surface p-5">
        <h2 className="text-[15px] font-semibold tracking-tight">Cardápio em PDF</h2>
        <MenuPdfForm fileName={aiSettings.menuPdfFileName} updatedAt={aiSettings.menuPdfUpdatedAt} />
      </section>

      <section className="flex flex-col gap-3.5 rounded-[20px] border border-border bg-surface p-5">
        <h2 className="text-[15px] font-semibold tracking-tight">Conversas recentes</h2>
        <ConversationsList conversations={conversations} />
      </section>
    </div>
  );
}
