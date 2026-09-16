import "server-only";

import PDFDocument from "pdfkit";

import type { PricingLine } from "@/server/orcamento/pricing";

function formatCurrency(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/**
 * Renders the same numbers formatOrcamentoMessage sends as text into a PDF
 * document — never a second source of truth for the price, just a second
 * output format of the one total/detalhamento the pricing engine already
 * calculated (calcularPreco, seção 7 do spec: preço nunca decidido de novo
 * aqui, só formatado).
 */
export function gerarOrcamentoPdf(params: {
  restaurantName: string;
  customerName?: string;
  detalhamento: PricingLine[];
  total: number;
  validoAte: Date;
}): Promise<Buffer> {
  const { restaurantName, customerName, detalhamento, total, validoAte } = params;

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(18).text(restaurantName, { align: "left" });
    doc.moveDown(0.3);
    doc.fontSize(13).fillColor("#555").text("Orçamento", { align: "left" });
    doc.moveDown(1);

    doc.fillColor("#000").fontSize(11);
    if (customerName) doc.text(`Cliente: ${customerName}`);
    doc.text(`Data: ${new Date().toLocaleDateString("pt-BR")}`);
    doc.text(`Válido até: ${validoAte.toLocaleDateString("pt-BR")}`);
    doc.moveDown(1);

    doc.fontSize(12).text("Itens", { underline: true });
    doc.moveDown(0.5);
    for (const linha of detalhamento) {
      doc.fontSize(11).text(`${linha.nome}`, { continued: true }).text(formatCurrency(linha.valor), { align: "right" });
    }
    doc.moveDown(0.8);

    doc.moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y).stroke();
    doc.moveDown(0.5);

    doc.fontSize(13).text("Total", { continued: true }).text(formatCurrency(total), { align: "right" });
    doc.moveDown(1.5);

    doc.fontSize(9).fillColor("#777").text("Orçamento sujeito a confirmação. Valores podem mudar após visita técnica, quando aplicável.");

    doc.end();
  });
}
