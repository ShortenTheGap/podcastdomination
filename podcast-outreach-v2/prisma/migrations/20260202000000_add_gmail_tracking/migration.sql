-- Add Gmail tracking fields to Touch table for reply detection
ALTER TABLE "Touch" ADD COLUMN "gmailMessageId" TEXT;
ALTER TABLE "Touch" ADD COLUMN "gmailThreadId" TEXT;
ALTER TABLE "Touch" ADD COLUMN "bounceReason" TEXT;

-- Create index for efficient thread lookups
CREATE INDEX "Touch_gmailThreadId_idx" ON "Touch"("gmailThreadId");


