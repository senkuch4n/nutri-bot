-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "mercadopagoUserId" TEXT;

-- CreateTable
CREATE TABLE "MercadoPagoAccount" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "userId" TEXT,
    "nickname" TEXT,
    "email" TEXT,
    "liveMode" BOOLEAN,
    "accessTokenEnc" TEXT,
    "refreshTokenEnc" TEXT,
    "scope" TEXT,
    "expiresAt" TIMESTAMP(3),
    "connectedAt" TIMESTAMP(3),
    "refreshedAt" TIMESTAMP(3),
    "errorCode" TEXT,
    "errorAt" TIMESTAMP(3),
    "errorNotifiedAt" TIMESTAMP(3),
    "missingAlertAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MercadoPagoAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MercadoPagoOAuthState" (
    "id" TEXT NOT NULL,
    "stateHash" TEXT NOT NULL,
    "codeVerifierEnc" TEXT NOT NULL,
    "sessionEmail" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MercadoPagoOAuthState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MercadoPagoOAuthState_stateHash_key" ON "MercadoPagoOAuthState"("stateHash");

-- CreateIndex
CREATE INDEX "MercadoPagoOAuthState_expiresAt_idx" ON "MercadoPagoOAuthState"("expiresAt");
