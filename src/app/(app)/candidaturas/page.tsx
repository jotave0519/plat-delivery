import { getTenant } from "@/lib/tenant";
import { listCandidaturas } from "@/server/queries/locacao";
import { CandidaturaCard } from "@/components/candidaturas/candidatura-card";

const STAGES = ["VISITA_AGENDADA", "DOCUMENTOS_PENDENTES", "EM_ANALISE"] as const;
const STAGE_LABELS: Record<(typeof STAGES)[number], string> = {
  VISITA_AGENDADA: "Visita agendada",
  DOCUMENTOS_PENDENTES: "Documentos pendentes",
  EM_ANALISE: "Em análise",
};

export default async function CandidaturasPage() {
  const tenant = await getTenant();
  const candidaturas = await listCandidaturas(tenant.restaurantId);

  return (
    <div className="flex flex-col gap-6 px-[clamp(18px,2.4vw,34px)] py-7 pb-16">
      <div className="flex flex-col gap-1">
        <h1 className="text-[22px] font-semibold tracking-tight">Candidaturas</h1>
        <p className="text-[13px] text-faint">
          Visitas agendadas e documentação coletada pelo WhatsApp. A aprovação final do candidato ainda é feita fora da plataforma nesta fase.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {STAGES.map((stage) => {
          const stageCandidaturas = candidaturas.filter((c) => c.status === stage);
          return (
            <div key={stage} className="flex flex-col gap-3">
              <div className="flex items-center gap-2 text-[13px] font-semibold text-muted">
                <span>{STAGE_LABELS[stage]}</span>
                <span className="rounded-full bg-neutral-bg px-2 py-0.5 text-[11px] font-medium text-neutral-icon">{stageCandidaturas.length}</span>
              </div>
              <div className="flex flex-col gap-3">
                {stageCandidaturas.length === 0 ? (
                  <p className="text-[12px] text-faint">Nenhuma candidatura aqui.</p>
                ) : (
                  stageCandidaturas.map((c) => <CandidaturaCard key={c.id} candidatura={c} />)
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
