export type DecisionStatus = 'APPROVED' | 'REVIEW_REQUIRED' | 'BLOCKED';

// Backward compatibility alias for Phase 1 components
export type GuardrailDecision = DecisionStatus;

export interface SimulatedTransaction {
  id: string;
  requesterAgent: string;
  merchant: string;
  domain: string;
  category: string;
  amount: number;
  currency: string;
  riskScore: number;
  decision: DecisionStatus;
  policyTriggered: string;
  reasoning: string;
  timestamp: string;
  paypalStatus: string;
}

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
  userBudgetLimit?: number;
  metadata?: Record<string, unknown>;
}

export interface SpendingPolicy {
  id: string;
  version: string;
  autoApprovalMaxAmount: number;
  reviewThresholdMaxAmount: number;
  supportedCurrencies: string[];
  blockedCategories: string[];
  restrictedDomainTlds: string[];
  enforceUserBudget: boolean;
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
  canProceedToPayment: boolean; // Authoritative backend flag
  purchaseIntent: PurchaseIntent;
  evaluatedAt: string;
  policyVersion: string;
  reasonCodes: string[];
  explanation: string;
  policyChecks: PolicyCheckResult[];
  reviewMetadata?: ReviewMetadata;
}

export type PaymentStatus = 
  | 'CREATED' 
  | 'APPROVED_BY_BUYER' 
  | 'COMPLETED' 
  | 'CANCELLED' 
  | 'FAILED'
  | 'RECONCILIATION_REQUIRED';

export interface PaymentRecord {
  paymentId: string;
  decisionId: string;
  paypalOrderId: string;
  paypalCaptureId?: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  approvalUrl?: string;
  payerId?: string;
  payerEmail?: string;
  createdAt: string;
  updatedAt: string;
  failureReason?: string;
  metadata?: Record<string, unknown>;
}

export interface CreateOrderResult {
  orderId: string;
  approvalUrl: string;
  decisionId: string;
  paymentId: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
}

export interface SettlementMismatchDetails {
  expectedAmount: number;
  expectedCurrency: string;
  capturedAmount?: number;
  capturedCurrency?: string;
  reason: string;
}

export interface CaptureOrderResult {
  paymentId: string;
  orderId: string;
  captureId: string;
  decisionId: string;
  status: 'COMPLETED' | 'RECONCILIATION_REQUIRED';
  reconciliationRequired?: boolean;
  reconciliationNotes?: string;
  settlementMismatch?: SettlementMismatchDetails;
  amount: number;
  currency: string;
  capturedAt: string;
  payerId?: string;
  payerEmail?: string;
}

export interface BackendHealthResponse {
  success: boolean;
  data?: {
    status: 'healthy' | 'degraded' | 'unhealthy';
    service: string;
    version: string;
    environment: string;
    timestamp: string;
    uptimeSeconds: number;
    checks: {
      system: string;
      memoryUsageMB: number;
      nodeVersion: string;
    };
  };
  error?: {
    message: string;
    code: string;
  };
}

export interface BackendStatusState {
  isConnected: boolean;
  isLoading: boolean;
  error: string | null;
  data: BackendHealthResponse['data'] | null;
  latencyMs: number | null;
  lastChecked: Date | null;
}

export interface DashboardMetrics {
  evaluatedCount: number;
  approvedCount: number;
  approvalRate: number;
  blockedCount: number;
  blockedRate: number;
  pendingCount: number;
  totalSimulatedVolume: number;
  capturedPaymentsCount?: number;
  capturedVolume?: number;
}

export type NavigationTab = 
  | 'overview' 
  | 'ai_agent' 
  | 'policies' 
  | 'transactions' 
  | 'payment_passports'
  | 'paypal_orders';

// Phase 4: Intent & Merchant/Product Discovery Types
export type BillingPeriod = 'monthly' | 'yearly' | 'one_time';

export interface ExtractedPurchaseIntent {
  product: string | null;
  merchant: string | null;
  domain: string | null;
  amount: number | null;
  currency: string | null;
  budget: number | null;
  billingPeriod: BillingPeriod | null;
  description: string;
  missingInformation: string[];
}

export interface DiscoveredProduct {
  title: string;
  sourceUrl: string;
  merchantName: string | null;
  merchantDomain: string | null;
  description: string;
  relevanceScore: number;
  unverifiedListedPrice: number | null;
  currency: string | null;
}

export interface DiscoveryRequest {
  message: string;
  maxResults?: number;
}

export interface DiscoveryResponse {
  query: string;
  extractedIntent?: ExtractedPurchaseIntent | null;
  resultsCount: number;
  results: DiscoveredProduct[];
}

export interface ParseIntentRequest {
  message: string;
}

export interface ParseIntentResponse {
  intent: ExtractedPurchaseIntent;
}


