export type DecisionStatus = 'APPROVED' | 'REVIEW_REQUIRED' | 'BLOCKED';

export type PolicyCheckStatus = 'PASSED' | 'FAILED' | 'WARNING';

export interface PolicyCheckResult {
  checkName: string;
  status: PolicyCheckStatus;
  message: string;
  details?: Record<string, unknown>;
}

export interface PurchaseIntent {
  id?: string;
  agentId: string;
  merchantName: string;
  merchantDomain?: string;
  category?: string;
  amount: number;
  currency: string;
  description?: string;
  userBudgetLimit?: number; // Explicitly stated user budget cap
  metadata?: Record<string, unknown>;
}

export interface SpendingPolicy {
  id: string;
  version: string;
  autoApprovalMaxAmount: number; // Default $100: purchases <= $100 can be auto-approved
  reviewThresholdMaxAmount: number; // Default $500: $100 < amount <= $500 requires review; > $500 requires explicit approval
  supportedCurrencies: string[]; // Allowed currencies (e.g., ['USD', 'EUR', 'GBP', 'CAD', 'AUD'])
  blockedCategories: string[]; // Prohibited categories (e.g., vouchers, crypto, gambling)
  restrictedDomainTlds: string[]; // Flagged top-level domains (e.g., .xyz, .top, .biz)
  enforceUserBudget: boolean; // If true, amounts exceeding userBudgetLimit cannot be approved automatically
  updatedAt: string;
}

export interface ReviewMetadata {
  reviewedBy: string;
  reviewedAt: string;
  reviewDecision: 'MANUALLY_APPROVED' | 'MANUALLY_REJECTED';
  reviewNotes?: string;
}

export interface AuthorizationDecision {
  decisionId: string;
  status: DecisionStatus;
  canProceedToPayment: boolean; // Authoritative flag: strictly true ONLY if status === 'APPROVED'
  purchaseIntent: PurchaseIntent;
  evaluatedAt: string;
  policyVersion: string;
  reasonCodes: string[];
  explanation: string;
  policyChecks: PolicyCheckResult[];
  reviewMetadata?: ReviewMetadata;
}

export interface DecisionFilter {
  status?: DecisionStatus;
  agentId?: string;
  limit?: number;
}
