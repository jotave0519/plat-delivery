-- CreateEnum
CREATE TYPE "ReviewSentiment" AS ENUM ('POSITIVA', 'NEUTRA', 'NEGATIVA');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('PENDENTE', 'RESPONDIDA', 'AGUARDANDO_DONO', 'RESOLVIDA');

-- AlterTable
ALTER TABLE "Restaurant" ADD COLUMN     "reviewAgentEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "reviewAgentGoogleLocationId" TEXT,
ADD COLUMN     "reviewAgentOwnerPhone" TEXT,
ADD COLUMN     "reviewAgentReviewLink" TEXT,
ADD COLUMN     "reviewAgentTomDeVoz" TEXT;

-- CreateTable
CREATE TABLE "Review" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "googleReviewId" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "text" TEXT,
    "sentiment" "ReviewSentiment",
    "status" "ReviewStatus" NOT NULL DEFAULT 'PENDENTE',
    "draftResponse" TEXT,
    "publishedResponse" TEXT,
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewRequestLog" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "orderId" TEXT,
    "phoneNumber" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewRequestLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Review_googleReviewId_key" ON "Review"("googleReviewId");

-- CreateIndex
CREATE INDEX "Review_restaurantId_idx" ON "Review"("restaurantId");

-- CreateIndex
CREATE INDEX "Review_restaurantId_status_idx" ON "Review"("restaurantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ReviewRequestLog_orderId_key" ON "ReviewRequestLog"("orderId");

-- CreateIndex
CREATE INDEX "ReviewRequestLog_restaurantId_idx" ON "ReviewRequestLog"("restaurantId");

-- CreateIndex
CREATE INDEX "ReviewRequestLog_sentAt_dueAt_idx" ON "ReviewRequestLog"("sentAt", "dueAt");

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewRequestLog" ADD CONSTRAINT "ReviewRequestLog_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
