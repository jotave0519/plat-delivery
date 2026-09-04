-- CreateEnum
CREATE TYPE "PhoneCallStatus" AS ENUM ('EM_ANDAMENTO', 'CONCLUIDA', 'TRANSFERIDA', 'FALHA');

-- AlterEnum
ALTER TYPE "OrderChannel" ADD VALUE 'TELEFONE_IA';

-- AlterTable
ALTER TABLE "Restaurant" ADD COLUMN     "phoneAgentElevenLabsAgentId" TEXT,
ADD COLUMN     "phoneAgentEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "phoneAgentHumanTransferNumber" TEXT,
ADD COLUMN     "phoneAgentTwilioNumber" TEXT;

-- CreateTable
CREATE TABLE "PhoneCall" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "callerPhone" TEXT NOT NULL,
    "calledNumber" TEXT NOT NULL,
    "elevenLabsConversationId" TEXT NOT NULL,
    "customerId" TEXT,
    "status" "PhoneCallStatus" NOT NULL DEFAULT 'EM_ANDAMENTO',
    "draftCart" JSONB,
    "orderId" TEXT,
    "transferredToHuman" BOOLEAN NOT NULL DEFAULT false,
    "errorNote" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "durationSeconds" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PhoneCall_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PhoneCall_elevenLabsConversationId_key" ON "PhoneCall"("elevenLabsConversationId");

-- CreateIndex
CREATE UNIQUE INDEX "PhoneCall_orderId_key" ON "PhoneCall"("orderId");

-- CreateIndex
CREATE INDEX "PhoneCall_restaurantId_idx" ON "PhoneCall"("restaurantId");

-- AddForeignKey
ALTER TABLE "PhoneCall" ADD CONSTRAINT "PhoneCall_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhoneCall" ADD CONSTRAINT "PhoneCall_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhoneCall" ADD CONSTRAINT "PhoneCall_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
