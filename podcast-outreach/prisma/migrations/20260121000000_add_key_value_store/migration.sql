-- CreateTable
CREATE TABLE "KeyValueStore" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KeyValueStore_pkey" PRIMARY KEY ("key")
);
