-- Create partial unique index to enforce that at most one settled payment record exists per decision
CREATE UNIQUE INDEX IF NOT EXISTS "payment_records_decision_settled_idx"
ON "payment_records"("decisionId")
WHERE "status" IN ('COMPLETED', 'RECONCILIATION_REQUIRED');

