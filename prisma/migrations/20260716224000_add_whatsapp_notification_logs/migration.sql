-- CreateEnum
CREATE TYPE "WhatsAppNotificationRole" AS ENUM ('EXPEDITEUR', 'BENEFICIAIRE');

-- CreateEnum
CREATE TYPE "WhatsAppProvider" AS ENUM ('DIALOG360', 'GREEN_API', 'META_CLOUD', 'DRY_RUN');

-- CreateEnum
CREATE TYPE "WhatsAppNotificationState" AS ENUM ('DRY_RUN', 'SENT', 'DELIVERED', 'READ', 'FAILED', 'SKIPPED_INVALID_RECIPIENT');

-- CreateTable
CREATE TABLE "WhatsAppNotificationLog" (
    "id" TEXT NOT NULL,
    "dedupKey" TEXT NOT NULL,
    "provider" "WhatsAppProvider" NOT NULL DEFAULT 'DRY_RUN',
    "messageId" TEXT,
    "sheetName" TEXT NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "codeColis" TEXT NOT NULL,
    "templateName" TEXT NOT NULL,
    "recipientRole" "WhatsAppNotificationRole" NOT NULL,
    "recipientName" TEXT NOT NULL,
    "recipientNumberHash" TEXT NOT NULL,
    "recipientNumberMasked" TEXT NOT NULL,
    "triggerStatus" TEXT NOT NULL,
    "dateConcerned" TEXT,
    "whatsappStatus" "WhatsAppNotificationState" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "error" TEXT,
    "errorCode" TEXT,
    "errorDescription" TEXT,
    "lastWebhookAt" TIMESTAMP(3),

    CONSTRAINT "WhatsAppNotificationLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppNotificationLog_dedupKey_key" ON "WhatsAppNotificationLog"("dedupKey");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppNotificationLog_messageId_key" ON "WhatsAppNotificationLog"("messageId");

-- CreateIndex
CREATE INDEX "WhatsAppNotificationLog_sheetName_codeColis_templateName_re_idx" ON "WhatsAppNotificationLog"("sheetName", "codeColis", "templateName", "recipientRole", "recipientNumberHash");

-- CreateIndex
CREATE INDEX "WhatsAppNotificationLog_messageId_idx" ON "WhatsAppNotificationLog"("messageId");
