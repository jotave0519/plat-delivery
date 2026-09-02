-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PaymentStatus" ADD VALUE 'AGUARDANDO_CONFIRMACAO_PIX';
ALTER TYPE "PaymentStatus" ADD VALUE 'PAGAMENTO_NA_ENTREGA';
ALTER TYPE "PaymentStatus" ADD VALUE 'PAGAMENTO_NA_RETIRADA';

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "customerNameOverride" TEXT,
ADD COLUMN     "pixProofBase64" TEXT,
ADD COLUMN     "pixProofMimeType" TEXT,
ADD COLUMN     "pixProofReceivedAt" TIMESTAMP(3);
