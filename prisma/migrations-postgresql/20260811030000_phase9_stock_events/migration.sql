-- CreateTable
CREATE TABLE "Purchase" (
    "id" TEXT NOT NULL,
    "boxCount" INTEGER NOT NULL,
    "tubesPerBox" INTEGER NOT NULL,
    "purchasedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lineMessageId" TEXT NOT NULL,
    "lineGroupId" TEXT NOT NULL,
    "lineUserId" TEXT,
    "originalMessage" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Purchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseAllocation" (
    "id" TEXT NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "tubeCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PurchaseAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShuttleTransfer" (
    "id" TEXT NOT NULL,
    "fromLocation" TEXT NOT NULL,
    "toLocation" TEXT NOT NULL,
    "tubeCount" DOUBLE PRECISION NOT NULL,
    "transferredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lineMessageId" TEXT NOT NULL,
    "lineGroupId" TEXT NOT NULL,
    "lineUserId" TEXT,
    "originalMessage" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShuttleTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Purchase_lineMessageId_key" ON "Purchase"("lineMessageId");

-- CreateIndex
CREATE INDEX "Purchase_purchasedAt_idx" ON "Purchase"("purchasedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseAllocation_purchaseId_location_key" ON "PurchaseAllocation"("purchaseId", "location");

-- CreateIndex
CREATE INDEX "PurchaseAllocation_location_idx" ON "PurchaseAllocation"("location");

-- CreateIndex
CREATE UNIQUE INDEX "ShuttleTransfer_lineMessageId_key" ON "ShuttleTransfer"("lineMessageId");

-- CreateIndex
CREATE INDEX "ShuttleTransfer_transferredAt_idx" ON "ShuttleTransfer"("transferredAt" DESC);

-- AddForeignKey
ALTER TABLE "PurchaseAllocation" ADD CONSTRAINT "PurchaseAllocation_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
