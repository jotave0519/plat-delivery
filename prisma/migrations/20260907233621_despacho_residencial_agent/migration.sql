-- CreateEnum
CREATE TYPE "ChamadoStatus" AS ENUM ('RECEBIDO', 'OFERTADO', 'A_CAMINHO', 'EM_ATENDIMENTO', 'CONCLUIDO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "UrgenciaNivel" AS ENUM ('NORMAL', 'URGENTE', 'EMERGENCIA');

-- AlterTable
ALTER TABLE "Restaurant" ADD COLUMN     "despachoAgentEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "despachoEscalationPhone" TEXT,
ADD COLUMN     "despachoOfertaTimeoutMinutos" INTEGER NOT NULL DEFAULT 5;

-- CreateTable
CREATE TABLE "TecnicoDisponibilidade" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "telefone" TEXT NOT NULL,
    "especialidades" TEXT[],
    "regioes" TEXT[],
    "disponivel" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TecnicoDisponibilidade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Chamado" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "customerId" TEXT,
    "tecnicoId" TEXT,
    "problema" TEXT NOT NULL,
    "endereco" TEXT NOT NULL,
    "urgencia" "UrgenciaNivel" NOT NULL DEFAULT 'NORMAL',
    "status" "ChamadoStatus" NOT NULL DEFAULT 'RECEBIDO',
    "tecnicosOfertados" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "ofertaExpiraEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Chamado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChamadoEvent" (
    "id" TEXT NOT NULL,
    "chamadoId" TEXT NOT NULL,
    "status" "ChamadoStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChamadoEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TecnicoDisponibilidade_restaurantId_idx" ON "TecnicoDisponibilidade"("restaurantId");

-- CreateIndex
CREATE INDEX "Chamado_restaurantId_idx" ON "Chamado"("restaurantId");

-- CreateIndex
CREATE INDEX "Chamado_restaurantId_status_idx" ON "Chamado"("restaurantId", "status");

-- CreateIndex
CREATE INDEX "ChamadoEvent_chamadoId_idx" ON "ChamadoEvent"("chamadoId");

-- AddForeignKey
ALTER TABLE "TecnicoDisponibilidade" ADD CONSTRAINT "TecnicoDisponibilidade_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chamado" ADD CONSTRAINT "Chamado_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chamado" ADD CONSTRAINT "Chamado_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chamado" ADD CONSTRAINT "Chamado_tecnicoId_fkey" FOREIGN KEY ("tecnicoId") REFERENCES "TecnicoDisponibilidade"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChamadoEvent" ADD CONSTRAINT "ChamadoEvent_chamadoId_fkey" FOREIGN KEY ("chamadoId") REFERENCES "Chamado"("id") ON DELETE CASCADE ON UPDATE CASCADE;
