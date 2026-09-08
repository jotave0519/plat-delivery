-- CreateEnum
CREATE TYPE "WhatsappAgentDomain" AS ENUM ('PEDIDO', 'DESPACHO', 'ORCAMENTO');

-- CreateEnum
CREATE TYPE "QuoteStatus" AS ENUM ('ENVIADO', 'ACEITO', 'EXPIRADO', 'RECUSADO');

-- AlterTable: replace despachoAgentEnabled (Boolean, never deployed to
-- production — Agente 3 has no push yet) with the generalized
-- whatsappAgentDomain enum; PEDIDO is the correct default for every
-- existing row (Casa Bonfim's despachoAgentEnabled was already false).
ALTER TABLE "Restaurant" DROP COLUMN "despachoAgentEnabled";
ALTER TABLE "Restaurant" ADD COLUMN     "whatsappAgentDomain" "WhatsappAgentDomain" NOT NULL DEFAULT 'PEDIDO',
ADD COLUMN     "quoteAgentEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "quoteAgentNicho" TEXT,
ADD COLUMN     "quoteFollowUpDias" INTEGER NOT NULL DEFAULT 2,
ADD COLUMN     "quoteValidadeDias" INTEGER NOT NULL DEFAULT 7;

-- CreateTable
CREATE TABLE "PricingRule" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "variavel" TEXT NOT NULL,
    "valorUnitario" DECIMAL(10,2) NOT NULL,
    "obrigatoria" BOOLEAN NOT NULL DEFAULT true,
    "condicao" JSONB,
    "ativo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "PricingRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quote" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "customerId" TEXT,
    "dadosColetados" JSONB NOT NULL,
    "precoCalculado" DECIMAL(10,2) NOT NULL,
    "status" "QuoteStatus" NOT NULL DEFAULT 'ENVIADO',
    "validoAte" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Quote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteFollowUp" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "enviarEm" TIMESTAMP(3) NOT NULL,
    "enviado" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "QuoteFollowUp_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PricingRule_restaurantId_idx" ON "PricingRule"("restaurantId");

-- CreateIndex
CREATE INDEX "Quote_restaurantId_idx" ON "Quote"("restaurantId");

-- CreateIndex
CREATE INDEX "Quote_restaurantId_status_idx" ON "Quote"("restaurantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "QuoteFollowUp_quoteId_key" ON "QuoteFollowUp"("quoteId");

-- AddForeignKey
ALTER TABLE "PricingRule" ADD CONSTRAINT "PricingRule_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteFollowUp" ADD CONSTRAINT "QuoteFollowUp_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;
