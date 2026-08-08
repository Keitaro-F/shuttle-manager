-- CreateEnum
CREATE TYPE "ReportSource" AS ENUM ('WEB', 'LINE');

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "newCount" DOUBLE PRECISION NOT NULL,
    "semiCount" DOUBLE PRECISION NOT NULL,
    "reportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" "ReportSource" NOT NULL DEFAULT 'WEB',
    "lineMessageId" TEXT,
    "lineGroupId" TEXT,
    "lineUserId" TEXT,
    "originalMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookReceipt" (
    "webhookEventId" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookReceipt_pkey" PRIMARY KEY ("webhookEventId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Report_lineMessageId_key" ON "Report"("lineMessageId");

-- CreateIndex
CREATE INDEX "Report_location_reportedAt_idx" ON "Report"("location", "reportedAt" DESC);

-- CreateIndex
CREATE INDEX "Report_reportedAt_idx" ON "Report"("reportedAt" DESC);
