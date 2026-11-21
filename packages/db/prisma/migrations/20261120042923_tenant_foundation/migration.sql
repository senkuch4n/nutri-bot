-- Professional.id is already a primary key. The composite key supports same-tenant foreign keys.
BEGIN;
-- CreateEnum
CREATE TYPE "TenantRole" AS ENUM ('OWNER', 'STAFF');

-- AlterTable
ALTER TABLE "Professional" ADD COLUMN     "tenantId" TEXT;

-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantMembership" (
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "TenantRole" NOT NULL,

    CONSTRAINT "TenantMembership_pkey" PRIMARY KEY ("tenantId","userId")
);

-- CreateTable
CREATE TABLE "Agenda" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "professionalId" INTEGER NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Agenda_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "TenantMembership_userId_idx" ON "TenantMembership"("userId");

-- CreateIndex
CREATE INDEX "Agenda_tenantId_professionalId_idx" ON "Agenda"("tenantId", "professionalId");

-- CreateIndex
CREATE INDEX "Professional_tenantId_idx" ON "Professional"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Professional_id_tenantId_key" ON "Professional"("id", "tenantId");

-- AddForeignKey
ALTER TABLE "TenantMembership" ADD CONSTRAINT "TenantMembership_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantMembership" ADD CONSTRAINT "TenantMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Agenda" ADD CONSTRAINT "Agenda_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Agenda" ADD CONSTRAINT "Agenda_professionalId_tenantId_fkey" FOREIGN KEY ("professionalId", "tenantId") REFERENCES "Professional"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Professional" ADD CONSTRAINT "Professional_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A tenant may have additional agendas in the future, but no second primary agenda.
CREATE UNIQUE INDEX "Agenda_primary_per_tenant_key" ON "Agenda"("tenantId") WHERE "isPrimary";

-- A legacy installation supports one professional. Do not guess if its data is ambiguous.
DO $$ BEGIN
  IF (SELECT count(*) FROM "Professional") > 1 THEN
    RAISE EXCEPTION 'Tenant foundation requires at most one legacy professional';
  END IF;
END $$;

INSERT INTO "Tenant" ("id") VALUES ('legacy-tenant');
UPDATE "Professional" SET "tenantId" = 'legacy-tenant';
INSERT INTO "Agenda" ("id", "tenantId", "professionalId", "isPrimary")
SELECT 'legacy-agenda', "tenantId", "id", true FROM "Professional";

COMMIT;
