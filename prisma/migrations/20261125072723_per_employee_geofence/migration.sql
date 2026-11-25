-- CreateEnum
CREATE TYPE "GeoRule" AS ENUM ('ANY_OFFICE', 'ASSIGNED_OFFICE', 'OFFICES_AND_ZONES', 'ZONES_ONLY', 'ANYWHERE');

-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "geoRule" "GeoRule" NOT NULL DEFAULT 'ANY_OFFICE',
ADD COLUMN     "geoStrict" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Punch" ADD COLUMN     "zoneName" TEXT;

-- CreateTable
CREATE TABLE "GeoZone" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "radiusM" INTEGER NOT NULL DEFAULT 150,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GeoZone_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GeoZone_employeeId_idx" ON "GeoZone"("employeeId");

-- AddForeignKey
ALTER TABLE "GeoZone" ADD CONSTRAINT "GeoZone_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
