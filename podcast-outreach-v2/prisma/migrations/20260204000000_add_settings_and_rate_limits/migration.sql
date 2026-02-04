-- Add Settings table for encrypted API key storage
CREATE TABLE "Setting" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "isSecret" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT,
    "category" TEXT NOT NULL DEFAULT 'general',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("id")
);

-- Add RateLimit table for API rate limiting
CREATE TABLE "RateLimit" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "windowStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RateLimit_pkey" PRIMARY KEY ("id")
);

-- Create unique constraint for Setting key
CREATE UNIQUE INDEX "Setting_key_key" ON "Setting"("key");

-- Create unique constraint for RateLimit (key + endpoint)
CREATE UNIQUE INDEX "RateLimit_key_endpoint_key" ON "RateLimit"("key", "endpoint");

-- Create index for RateLimit cleanup queries
CREATE INDEX "RateLimit_windowStart_idx" ON "RateLimit"("windowStart");

