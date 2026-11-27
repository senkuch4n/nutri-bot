-- CreateTable
CREATE TABLE "GoogleCalendarAccount" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "googleSubject" TEXT,
    "googleEmail" TEXT,
    "refreshTokenEnc" TEXT,
    "scope" TEXT,
    "calendarId" TEXT,
    "connectedAt" TIMESTAMP(3),
    "disconnectedAt" TIMESTAMP(3),
    "syncError" TEXT,
    "syncErrorAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoogleCalendarAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoogleCalendarOAuthState" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "stateHash" TEXT NOT NULL,
    "codeVerifierEnc" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GoogleCalendarOAuthState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GoogleCalendarAccount_tenantId_key" ON "GoogleCalendarAccount"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "GoogleCalendarOAuthState_stateHash_key" ON "GoogleCalendarOAuthState"("stateHash");

-- CreateIndex
CREATE INDEX "GoogleCalendarOAuthState_expiresAt_idx" ON "GoogleCalendarOAuthState"("expiresAt");

-- CreateIndex
CREATE INDEX "GoogleCalendarOAuthState_tenantId_idx" ON "GoogleCalendarOAuthState"("tenantId");

-- CreateIndex
CREATE INDEX "GoogleCalendarOAuthState_userId_idx" ON "GoogleCalendarOAuthState"("userId");

-- AddForeignKey
ALTER TABLE "GoogleCalendarAccount" ADD CONSTRAINT "GoogleCalendarAccount_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoogleCalendarOAuthState" ADD CONSTRAINT "GoogleCalendarOAuthState_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoogleCalendarOAuthState" ADD CONSTRAINT "GoogleCalendarOAuthState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
