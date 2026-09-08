-- CreateEnum
CREATE TYPE "PhoneAgentDomain" AS ENUM ('PEDIDO', 'ATENDIMENTO_GENERICO');

-- AlterTable
ALTER TABLE "Restaurant" ADD COLUMN     "faqGenericoText" TEXT,
ADD COLUMN     "phoneAgentDomain" "PhoneAgentDomain" NOT NULL DEFAULT 'PEDIDO',
ADD COLUMN     "servicosGenericosJson" JSONB;

-- CreateTable
CREATE TABLE "HorarioDisponivel" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "dataHora" TIMESTAMP(3) NOT NULL,
    "duracaoMin" INTEGER NOT NULL DEFAULT 30,
    "ocupado" BOOLEAN NOT NULL DEFAULT false,
    "callId" TEXT,

    CONSTRAINT "HorarioDisponivel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CallbackRequest" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "callerPhone" TEXT NOT NULL,
    "motivo" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDENTE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CallbackRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HorarioDisponivel_restaurantId_idx" ON "HorarioDisponivel"("restaurantId");

-- CreateIndex
CREATE INDEX "HorarioDisponivel_restaurantId_dataHora_idx" ON "HorarioDisponivel"("restaurantId", "dataHora");

-- CreateIndex
CREATE INDEX "CallbackRequest_restaurantId_idx" ON "CallbackRequest"("restaurantId");

-- AddForeignKey
ALTER TABLE "HorarioDisponivel" ADD CONSTRAINT "HorarioDisponivel_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallbackRequest" ADD CONSTRAINT "CallbackRequest_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
