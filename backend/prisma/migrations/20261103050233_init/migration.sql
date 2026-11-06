-- CreateEnum
CREATE TYPE "DecisionStatus" AS ENUM ('APPROVED', 'REVIEW_REQUIRED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('CREATED', 'APPROVED_BY_BUYER', 'COMPLETED', 'CANCELLED', 'FAILED', 'RECONCILIATION_REQUIRED');

-- CreateEnum
CREATE TYPE "ReviewDecision" AS ENUM ('MANUALLY_APPROVED', 'MANUALLY_REJECTED');

-- CreateTable
CREATE TABLE "authorization_decisions" (
    "decisionId" TEXT NOT NULL,
    "status" "DecisionStatus" NOT NULL,
    "canProceedToPayment" BOOLEAN NOT NULL,
    "intentId" TEXT,
    "agentId" TEXT NOT NULL,
    "merchantName" TEXT NOT NULL,
    "merchantDomain" TEXT,
    "category" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "description" TEXT,
    "userBudgetLimit" DECIMAL(12,2),
    "intentMetadata" JSONB,
    "policyVersion" TEXT NOT NULL,
    "reasonCodes" TEXT[],
    "explanation" TEXT NOT NULL,
    "policyChecks" JSONB NOT NULL,
    "riskScore" INTEGER,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewDecision" "ReviewDecision",
    "reviewNotes" TEXT,
    "evaluatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "authorization_decisions_pkey" PRIMARY KEY ("decisionId")
);

-- CreateTable
CREATE TABLE "payment_records" (
    "paymentId" TEXT NOT NULL,
    "decisionId" TEXT NOT NULL,
    "paypalOrderId" TEXT NOT NULL,
    "paypalCaptureId" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "status" "PaymentStatus" NOT NULL,
    "approvalUrl" TEXT,
    "payerId" TEXT,
    "payerEmail" TEXT,
    "failureReason" TEXT,
    "settlementMismatch" JSONB,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_records_pkey" PRIMARY KEY ("paymentId")
);

-- CreateIndex
CREATE INDEX "authorization_decisions_agentId_idx" ON "authorization_decisions"("agentId");

-- CreateIndex
CREATE INDEX "authorization_decisions_status_idx" ON "authorization_decisions"("status");

-- CreateIndex
CREATE INDEX "authorization_decisions_evaluatedAt_idx" ON "authorization_decisions"("evaluatedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "payment_records_paypalOrderId_key" ON "payment_records"("paypalOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "payment_records_paypalCaptureId_key" ON "payment_records"("paypalCaptureId");

-- CreateIndex
CREATE INDEX "payment_records_decisionId_idx" ON "payment_records"("decisionId");

-- CreateIndex
CREATE INDEX "payment_records_status_idx" ON "payment_records"("status");

-- CreateIndex
CREATE INDEX "payment_records_createdAt_idx" ON "payment_records"("createdAt" DESC);

-- AddForeignKey
ALTER TABLE "payment_records" ADD CONSTRAINT "payment_records_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "authorization_decisions"("decisionId") ON DELETE RESTRICT ON UPDATE CASCADE;
