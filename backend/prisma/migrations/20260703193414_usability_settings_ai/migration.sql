-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "document" TEXT,
ADD COLUMN     "extra" JSONB;

-- AlterTable
ALTER TABLE "vehicles" ADD COLUMN     "description" TEXT;

-- CreateTable
CREATE TABLE "settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("key")
);
