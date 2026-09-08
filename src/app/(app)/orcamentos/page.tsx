import { getTenant } from "@/lib/tenant";
import { listQuotes } from "@/server/queries/orcamento";
import { QuoteCard } from "@/components/orcamentos/quote-card";

export default async function OrcamentosPage() {
  const tenant = await getTenant();
  const quotes = await listQuotes(tenant.restaurantId);

  const enviados = quotes.filter((q) => q.status === "ENVIADO");
  const outros = quotes.filter((q) => q.status !== "ENVIADO");

  return (
    <div className="flex flex-col gap-6 px-[clamp(18px,2.4vw,34px)] py-7 pb-16">
      <div className="flex flex-col gap-1">
        <h1 className="text-[22px] font-semibold tracking-tight">Orçamentos</h1>
        <p className="text-[13px] text-faint">
          O preço sai automaticamente da tabela configurada — a IA só coleta os dados pelo WhatsApp. Use as ações aqui só quando o cliente responder por outro canal (telefone, presencial).
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-[14px] font-semibold text-muted">Aguardando resposta ({enviados.length})</h2>
        {enviados.length === 0 ? (
          <p className="text-[12.5px] text-faint">Nenhum orçamento aguardando resposta.</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {enviados.map((q) => (
              <QuoteCard key={q.id} quote={q} />
            ))}
          </div>
        )}
      </div>

      {outros.length > 0 ? (
        <div className="flex flex-col gap-3">
          <h2 className="text-[14px] font-semibold text-muted">Histórico recente</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {outros.map((q) => (
              <QuoteCard key={q.id} quote={q} />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
