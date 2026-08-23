-- CreateEnum
CREATE TYPE "SupportConversationStatus" AS ENUM ('open', 'waiting_admin', 'waiting_guest', 'closed', 'archived');

-- CreateEnum
CREATE TYPE "SupportSenderType" AS ENUM ('guest', 'admin', 'system');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('conversation_deleted', 'conversation_archived', 'status_changed', 'assigned', 'auto_closed');

-- CreateTable
CREATE TABLE "contacts" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "contact" VARCHAR(200) NOT NULL,
    "subject" VARCHAR(300) NOT NULL,
    "message" TEXT NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_conversations" (
    "id" TEXT NOT NULL,
    "guestToken" TEXT NOT NULL,
    "guestName" TEXT,
    "pageUrl" TEXT,
    "checkoutProducts" JSONB,
    "assignedAdminId" TEXT,
    "status" "SupportConversationStatus" NOT NULL DEFAULT 'waiting_admin',
    "lastMessageAt" TIMESTAMP(3),
    "unreadAdminCount" INTEGER NOT NULL DEFAULT 0,
    "unreadGuestCount" INTEGER NOT NULL DEFAULT 0,
    "lastNotifiedAt" TIMESTAMP(3),
    "firstResponseAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "support_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_messages" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "senderType" "SupportSenderType" NOT NULL,
    "senderId" TEXT,
    "content" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "attachments" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_notification_logs" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "notificationType" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "retries" INTEGER NOT NULL DEFAULT 0,
    "providerResponse" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "support_notification_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_audit_logs" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "adminId" TEXT,
    "action" "AuditAction" NOT NULL,
    "previousValue" JSONB,
    "newValue" JSONB,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "support_conversations_guestToken_key" ON "support_conversations"("guestToken");

-- CreateIndex
CREATE INDEX "support_conversations_status_lastMessageAt_idx" ON "support_conversations"("status", "lastMessageAt");

-- CreateIndex
CREATE INDEX "support_conversations_unreadAdminCount_lastMessageAt_idx" ON "support_conversations"("unreadAdminCount", "lastMessageAt");

-- CreateIndex
CREATE INDEX "support_messages_conversationId_createdAt_idx" ON "support_messages"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "support_messages_conversationId_readAt_idx" ON "support_messages"("conversationId", "readAt");

-- CreateIndex
CREATE INDEX "support_notification_logs_conversationId_createdAt_idx" ON "support_notification_logs"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "support_audit_logs_conversationId_createdAt_idx" ON "support_audit_logs"("conversationId", "createdAt");

-- AddForeignKey
ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "support_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
