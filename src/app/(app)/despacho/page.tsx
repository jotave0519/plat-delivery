import { getTenant } from "@/lib/tenant";
import { listChamados, listTecnicos } from "@/server/queries/despacho";
import { CHAMADO_PIPELINE_STAGES, CHAMADO_FLOW } from "@/lib/chamado-flow";
import { ChamadoCard, ChamadoEmptyState } from "@/components/despacho/chamado-card";

export default async function DespachoPage() {
  const tenant = await getTenant();
  const [chamados, tecnicos] = await Promise.all([listChamados(tenant.restaurantId), listTecnicos(tenant.restaurantId)]);

  const encerrados = chamados.filter((c) => c.status === "CONCLUIDO" || c.status === "CANCELADO").slice(0, 10);

  return (
    <div className="flex flex-col gap-6 px-[clamp(18px,2.4vw,34px)] py-7 pb-16">
      <div className="flex flex-col gap-1">
        <h1 className="text-[22px] font-semibold tracking-tight">Despacho</h1>
        <p className="text-[13px] text-faint">
          Fila de chamados em andamento — o técnico aceita/atualiza pelo próprio WhatsApp; use as ações aqui só quando precisar intervir manualmente.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {CHAMADO_PIPELINE_STAGES.map((stage) => {
          const stageChamados = chamados.filter((c) => c.status === stage);
          return (
            <div key={stage} className="flex flex-col gap-3">
              <div className="flex items-center gap-2 text-[13px] font-semibold text-muted">
                <span>{CHAMADO_FLOW[stage].label}</span>
                <span className="rounded-full bg-neutral-bg px-2 py-0.5 text-[11px] font-medium text-neutral-icon">{stageChamados.length}</span>
              </div>
              <div className="flex flex-col gap-3">
                {stageChamados.length === 0 ? (
                  <ChamadoEmptyState text="Nenhum chamado aqui" />
                ) : (
                  stageChamados.map((c) => <ChamadoCard key={c.id} chamado={c} tecnicos={tecnicos} />)
                )}
              </div>
            </div>
          );
        })}
      </div>

      {encerrados.length > 0 ? (
        <div className="flex flex-col gap-3">
          <h2 className="text-[14px] font-semibold text-muted">Encerrados recentemente</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {encerrados.map((c) => (
              <ChamadoCard key={c.id} chamado={c} tecnicos={tecnicos} />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
