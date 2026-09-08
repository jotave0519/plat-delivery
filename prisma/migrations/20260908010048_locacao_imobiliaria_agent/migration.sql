-- CreateEnum
CREATE TYPE "StatusCandidatura" AS ENUM ('VISITA_AGENDADA', 'DOCUMENTOS_PENDENTES', 'EM_ANALISE');

-- AlterEnum
ALTER TYPE "WhatsappAgentDomain" ADD VALUE 'LOCACAO';

-- AlterTable
ALTER TABLE "Restaurant" ADD COLUMN     "locacaoVisitaDuracaoMin" INTEGER NOT NULL DEFAULT 30;

-- CreateTable
CREATE TABLE "Corretor" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "telefone" TEXT NOT NULL,
    "disponivel" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Corretor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Imovel" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "corretorId" TEXT,
    "endereco" TEXT NOT NULL,
    "valorAluguel" DECIMAL(10,2) NOT NULL,
    "fotos" TEXT[],
    "condicoes" TEXT,
    "disponivel" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Imovel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Candidatura" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "imovelId" TEXT NOT NULL,
    "customerId" TEXT,
    "corretorId" TEXT,
    "telefone" TEXT NOT NULL,
    "status" "StatusCandidatura" NOT NULL DEFAULT 'VISITA_AGENDADA',
    "visitaAgendadaPara" TIMESTAMP(3),
    "documentos" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Candidatura_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Corretor_restaurantId_idx" ON "Corretor"("restaurantId");

-- CreateIndex
CREATE INDEX "Imovel_restaurantId_idx" ON "Imovel"("restaurantId");

-- CreateIndex
CREATE INDEX "Candidatura_restaurantId_idx" ON "Candidatura"("restaurantId");

-- CreateIndex
CREATE INDEX "Candidatura_restaurantId_status_idx" ON "Candidatura"("restaurantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Candidatura_corretorId_visitaAgendadaPara_key" ON "Candidatura"("corretorId", "visitaAgendadaPara");

-- AddForeignKey
ALTER TABLE "Corretor" ADD CONSTRAINT "Corretor_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Imovel" ADD CONSTRAINT "Imovel_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Imovel" ADD CONSTRAINT "Imovel_corretorId_fkey" FOREIGN KEY ("corretorId") REFERENCES "Corretor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Candidatura" ADD CONSTRAINT "Candidatura_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Candidatura" ADD CONSTRAINT "Candidatura_imovelId_fkey" FOREIGN KEY ("imovelId") REFERENCES "Imovel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Candidatura" ADD CONSTRAINT "Candidatura_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Candidatura" ADD CONSTRAINT "Candidatura_corretorId_fkey" FOREIGN KEY ("corretorId") REFERENCES "Corretor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
