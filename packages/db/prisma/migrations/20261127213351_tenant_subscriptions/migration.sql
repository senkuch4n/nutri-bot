-- CreateEnum
CREATE TYPE "BillingMode" AS ENUM ('SANDBOX', 'LIVE');

-- CreateEnum
CREATE TYPE "BillingPeriodUnit" AS ENUM ('DAYS', 'MONTHS');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('PENDING', 'TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED');

-- CreateEnum
CREATE TYPE "SubscriptionCancelOrigin" AS ENUM ('PANEL', 'MERCADO_PAGO');

-- CreateEnum
CREATE TYPE "SubscriptionEventSource" AS ENUM ('WEBHOOK', 'RECONCILIATION', 'PANEL');

-- CreateEnum
CREATE TYPE "SubscriptionEventResult" AS ENUM ('APPLIED', 'UNCHANGED', 'IGNORED', 'REJECTED');

-- CreateTable
CREATE TABLE "SubscriptionPlan" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "mode" "BillingMode" NOT NULL,
    "name" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'ARS',
    "frequency" INTEGER NOT NULL,
    "frequencyUnit" "BillingPeriodUnit" NOT NULL,
    "trialLength" INTEGER,
    "trialUnit" "BillingPeriodUnit",
    "billingCycles" INTEGER,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubscriptionPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubscriptionPlanOffer" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "allowTrial" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubscriptionPlanOffer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantSubscription" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "offerId" TEXT,
    "startedByUserId" TEXT NOT NULL,
    "mode" "BillingMode" NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'PENDING',
    "externalReference" TEXT NOT NULL,
    "mercadoPagoPreapprovalId" TEXT,
    "mercadoPagoStatus" TEXT,
    "collectorUserId" TEXT,
    "payerUserId" TEXT,
    "checkoutUrl" TEXT,
    "checkoutPayerEmail" TEXT,
    "checkoutCreateLeaseUntil" TIMESTAMP(3),
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "frequency" INTEGER NOT NULL,
    "frequencyUnit" "BillingPeriodUnit" NOT NULL,
    "trialLength" INTEGER,
    "trialUnit" "BillingPeriodUnit",
    "billingCycles" INTEGER,
    "trialGranted" BOOLEAN NOT NULL,
    "authorizedAt" TIMESTAMP(3),
    "trialEndsAt" TIMESTAMP(3),
    "nextPaymentDate" TIMESTAMP(3),
    "cancelRequestedAt" TIMESTAMP(3),
    "canceledAt" TIMESTAMP(3),
    "cancelOrigin" "SubscriptionCancelOrigin",
    "mercadoPagoLastModified" TIMESTAMP(3),
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubscriptionEvent" (
    "id" TEXT NOT NULL,
    "source" "SubscriptionEventSource" NOT NULL,
    "topic" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "requestId" TEXT,
    "result" "SubscriptionEventResult" NOT NULL,
    "reason" TEXT,
    "tenantId" TEXT,
    "subscriptionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubscriptionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionPlan_mode_code_key" ON "SubscriptionPlan"("mode", "code");

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionPlanOffer_tenantId_planId_key" ON "SubscriptionPlanOffer"("tenantId", "planId");

-- CreateIndex
CREATE UNIQUE INDEX "TenantSubscription_externalReference_key" ON "TenantSubscription"("externalReference");

-- CreateIndex
CREATE UNIQUE INDEX "TenantSubscription_mercadoPagoPreapprovalId_key" ON "TenantSubscription"("mercadoPagoPreapprovalId");

-- CreateIndex
CREATE INDEX "TenantSubscription_tenantId_createdAt_idx" ON "TenantSubscription"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "TenantSubscription_status_idx" ON "TenantSubscription"("status");

-- CreateIndex
CREATE INDEX "TenantSubscription_startedByUserId_idx" ON "TenantSubscription"("startedByUserId");

-- CreateIndex
CREATE INDEX "TenantSubscription_offerId_idx" ON "TenantSubscription"("offerId");

-- CreateIndex
CREATE UNIQUE INDEX "TenantSubscription_id_tenantId_key" ON "TenantSubscription"("id", "tenantId");

-- CreateIndex
CREATE INDEX "SubscriptionEvent_subscriptionId_createdAt_idx" ON "SubscriptionEvent"("subscriptionId", "createdAt");

-- CreateIndex
CREATE INDEX "SubscriptionEvent_tenantId_createdAt_idx" ON "SubscriptionEvent"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "SubscriptionEvent_createdAt_idx" ON "SubscriptionEvent"("createdAt");

-- AddForeignKey
ALTER TABLE "SubscriptionPlanOffer" ADD CONSTRAINT "SubscriptionPlanOffer_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionPlanOffer" ADD CONSTRAINT "SubscriptionPlanOffer_planId_fkey" FOREIGN KEY ("planId") REFERENCES "SubscriptionPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantSubscription" ADD CONSTRAINT "TenantSubscription_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantSubscription" ADD CONSTRAINT "TenantSubscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "SubscriptionPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantSubscription" ADD CONSTRAINT "TenantSubscription_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "SubscriptionPlanOffer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantSubscription" ADD CONSTRAINT "TenantSubscription_startedByUserId_fkey" FOREIGN KEY ("startedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionEvent" ADD CONSTRAINT "SubscriptionEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionEvent" ADD CONSTRAINT "SubscriptionEvent_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "TenantSubscription"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- HU-029b: como máximo una suscripción no terminada por consultorio (X6).
CREATE UNIQUE INDEX "TenantSubscription_open_per_tenant_key" ON "TenantSubscription"("tenantId")
  WHERE "status" IN ('PENDING', 'TRIALING', 'ACTIVE', 'PAST_DUE');

-- HU-029b: como máximo un plan por defecto por modo.
CREATE UNIQUE INDEX "SubscriptionPlan_default_per_mode_key" ON "SubscriptionPlan"("mode") WHERE "isDefault";

-- HU-029b: términos válidos a nivel base (la validación completa está en packages/core).
ALTER TABLE "SubscriptionPlan"
  ADD CONSTRAINT "SubscriptionPlan_amount_positive" CHECK ("amount" > 0),
  ADD CONSTRAINT "SubscriptionPlan_frequency_positive" CHECK ("frequency" > 0),
  ADD CONSTRAINT "SubscriptionPlan_trial_pair" CHECK (("trialLength" IS NULL) = ("trialUnit" IS NULL)),
  ADD CONSTRAINT "SubscriptionPlan_trial_positive" CHECK ("trialLength" IS NULL OR "trialLength" > 0),
  ADD CONSTRAINT "SubscriptionPlan_cycles_positive" CHECK ("billingCycles" IS NULL OR "billingCycles" > 0);
ALTER TABLE "TenantSubscription"
  ADD CONSTRAINT "TenantSubscription_trial_pair" CHECK (("trialLength" IS NULL) = ("trialUnit" IS NULL)),
  ADD CONSTRAINT "TenantSubscription_trial_granted" CHECK (NOT "trialGranted" OR "trialLength" IS NOT NULL),
  -- HU-029b (G3, X14): el email del pagador solo vive mientras el checkout está sin autorizar.
  ADD CONSTRAINT "TenantSubscription_payer_email_transient" CHECK (
    "checkoutPayerEmail" IS NULL OR ("status" = 'PENDING' AND "authorizedAt" IS NULL)),
  ADD CONSTRAINT "TenantSubscription_payer_email_length" CHECK (
    "checkoutPayerEmail" IS NULL OR char_length("checkoutPayerEmail") BETWEEN 3 AND 254);

-- HU-029b (D1, X13): plan mensual por defecto, $60.000 ARS, 7 días de prueba, en los dos modos.
INSERT INTO "SubscriptionPlan"
  ("id", "code", "mode", "name", "amount", "currency", "frequency", "frequencyUnit",
   "trialLength", "trialUnit", "billingCycles", "isPublic", "isDefault", "active", "createdAt", "updatedAt")
VALUES
  ('plan_mensual_live',    'mensual', 'LIVE',    'Plan mensual', 60000.00, 'ARS', 1, 'MONTHS', 7, 'DAYS', NULL, true, true, true, now(), now()),
  ('plan_mensual_sandbox', 'mensual', 'SANDBOX', 'Plan mensual', 60000.00, 'ARS', 1, 'MONTHS', 7, 'DAYS', NULL, true, true, true, now(), now())
ON CONFLICT DO NOTHING;
