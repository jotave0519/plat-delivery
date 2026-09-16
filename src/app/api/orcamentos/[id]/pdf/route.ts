import { getTenant } from "@/lib/tenant";
import { db } from "@/lib/db";
import { gerarOrcamentoPdf } from "@/server/orcamento/pdf";
import { calcularPreco } from "@/server/orcamento/pricing";

/**
 * Downloads a quote as PDF. Requires a real session — getTenant() scopes
 * the lookup to the caller's own restaurant, same guard as every other
 * tenant-scoped query in the app.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tenant = await getTenant();

  const quote = await db.quote.findFirst({
    where: { id, restaurantId: tenant.restaurantId },
    include: { customer: true },
  });
  if (!quote) return new Response("Orçamento não encontrado.", { status: 404 });

  const [restaurant, priced] = await Promise.all([
    db.restaurant.findUniqueOrThrow({ where: { id: tenant.restaurantId }, select: { name: true } }),
    calcularPreco(tenant.restaurantId, quote.dadosColetados as Record<string, number>),
  ]);
  if ("error" in priced) return new Response(priced.error, { status: 422 });

  const pdfBuffer = await gerarOrcamentoPdf({
    restaurantName: restaurant.name,
    customerName: quote.customer?.name,
    detalhamento: priced.detalhamento,
    total: priced.total,
    validoAte: quote.validoAte,
  });

  return new Response(new Uint8Array(pdfBuffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="orcamento-${id}.pdf"`,
    },
  });
}
