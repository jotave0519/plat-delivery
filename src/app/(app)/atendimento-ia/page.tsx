import { Lock } from "lucide-react";

import { getTenant } from "@/lib/tenant";
import { getWhatsappConnection } from "@/server/queries/atendimento";
import { WhatsappConnectionCard } from "@/components/atendimento/whatsapp-connection-card";

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

  const connection = await getWhatsappConnection(tenant.restaurantId);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5 px-[clamp(18px,2.4vw,34px)] py-7 pb-16">
      <div className="flex flex-col gap-1">
        <h1 className="text-[22px] font-semibold tracking-tight">Atendimento IA</h1>
        <p className="text-[13px] text-faint">
          Conexão do restaurante com o WhatsApp, via Evolution API. O agente de atendimento automático chega em uma
          próxima etapa — por enquanto, esta tela só cuida de conectar o número.
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
    </div>
  );
}
