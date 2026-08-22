-- CreateEnum
CREATE TYPE "VehicleMediaType" AS ENUM ('PHOTO', 'VIDEO');

-- AlterTable
ALTER TABLE "vehicle_photos" ADD COLUMN     "type" "VehicleMediaType" NOT NULL DEFAULT 'PHOTO';
