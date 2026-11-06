export type PaymentStatus = 
  | 'CREATED' 
  | 'APPROVED_BY_BUYER' 
  | 'COMPLETED' 
  | 'CANCELLED' 
  | 'FAILED'
  | 'RECONCILIATION_REQUIRED';

export interface SettlementMismatchDetails {
  expectedAmount: number;
  expectedCurrency: string;
  capturedAmount: number;
  capturedCurrency: string;
  reason: string;
}

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
  settlementMismatch?: SettlementMismatchDetails;
  metadata?: Record<string, unknown>;
}

export interface PaymentFilter {
  decisionId?: string;
  status?: PaymentStatus;
  limit?: number;
}

export interface PayPalErrorDetail {
  issue?: string;
  description?: string;
  field?: string;
  value?: string;
}

export interface CreateOrderRequest {
  decisionId: string;
  customDescription?: string;
  retry?: boolean;
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

export interface CaptureOrderRequest {
  orderId: string;
}

export interface CaptureOrderResult {
  paymentId: string;
  orderId: string;
  captureId: string;
  decisionId: string;
  status: 'COMPLETED' | 'RECONCILIATION_REQUIRED';
  amount: number;
  currency: string;
  capturedAt: string;
  payerId?: string;
  payerEmail?: string;
  reconciliationNotes?: string;
  settlementMismatch?: SettlementMismatchDetails;
}

export interface PayPalOAuthTokenResponse {
  scope: string;
  access_token: string;
  token_type: string;
  app_id: string;
  expires_in: number;
  nonce: string;
}

export interface PayPalOrderResponse {
  id: string;
  status: string;
  links: Array<{
    href: string;
    rel: string;
    method: string;
  }>;
  purchase_units?: Array<{
    reference_id?: string;
    description?: string;
    amount: {
      currency_code: string;
      value: string;
    };
    payments?: {
      captures?: Array<{
        id: string;
        status: string;
        amount: {
          currency_code: string;
          value: string;
        };
        create_time?: string;
        update_time?: string;
      }>;
    };
  }>;
  payer?: {
    payer_id?: string;
    email_address?: string;
    name?: {
      given_name?: string;
      surname?: string;
    };
  };
}
