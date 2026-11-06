import { randomUUID } from 'crypto';
import { config } from '../config/env';
import {
  CreateOrderRequest,
  CreateOrderResult,
  CaptureOrderRequest,
  CaptureOrderResult,
  PaymentRecord,
  PaymentFilter,
  SettlementMismatchDetails,
} from '../types/payment.types';
import { IPaymentRepository } from '../repositories/payment.repository';
import { IAuthorizationDecisionRepository } from '../repositories/decision.repository';
import { paymentRepository, decisionRepository } from '../repositories/factory';
import { PayPalService, payPalService, PayPalApiError } from './paypal.service';

/**
 * Converts a currency amount (number or string) to integer minor units (e.g. cents)
 * to ensure reliable, currency-safe decimal comparisons without IEEE 754 floating-point inaccuracies.
 */
export function toMinorUnits(value: number | string | null | undefined): number {
  if (value === null || value === undefined) return NaN;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return NaN;
    const parsed = parseFloat(trimmed);
    if (isNaN(parsed) || !isFinite(parsed)) return NaN;
    return Math.round(parsed * 100);
  }
  if (typeof value === 'number') {
    if (isNaN(value) || !isFinite(value)) return NaN;
    return Math.round(value * 100);
  }
  return NaN;
}

/**
 * Domain-specific payment authorization & validation error
 * that maps to appropriate HTTP 4xx status codes.
 */
export class PaymentAuthorizationError extends Error {
  public readonly statusCode: number;
  public readonly code: string;

  constructor(message: string, statusCode = 403, code = 'PAYMENT_AUTHORIZATION_DENIED') {
    super(message);
    this.name = 'PaymentAuthorizationError';
    this.statusCode = statusCode;
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class PaymentService {
  constructor(
    private readonly payPalSvc: PayPalService = payPalService,
    private readonly paymentRepo: IPaymentRepository = paymentRepository,
    private readonly decisionRepo: IAuthorizationDecisionRepository = decisionRepository
  ) {}

  /**
   * Authoritative Order Creation Endpoint.
   * Creates a PayPal Sandbox Order strictly bound to an APPROVED decision.
   */
  public async createOrder(
    request: CreateOrderRequest,
    clientInputs?: { amount?: number; currency?: string }
  ): Promise<CreateOrderResult> {
    const decisionId = request.decisionId?.trim();
    if (!decisionId) {
      throw new PaymentAuthorizationError('decisionId is required to create a payment order.', 400, 'INVALID_DECISION_ID');
    }

    // 1. Retrieve authoritative decision from backend repository
    const decision = await this.decisionRepo.findById(decisionId);
    if (!decision) {
      throw new PaymentAuthorizationError(`Authorization decision "${decisionId}" not found in repository.`, 404, 'DECISION_NOT_FOUND');
    }

    // 2. Strict Security Gate: Never trust client status or flags
    if (decision.status !== 'APPROVED' || !decision.canProceedToPayment) {
      if (decision.status === 'REVIEW_REQUIRED') {
        throw new PaymentAuthorizationError(
          'Cannot create PayPal order for a request requiring review. Please obtain supervisor authorization first.',
          403,
          'PAYMENT_REVIEW_REQUIRED'
        );
      }
      if (decision.status === 'BLOCKED') {
        throw new PaymentAuthorizationError(
          'Cannot create PayPal order for a BLOCKED request. Mandatory security policies were violated.',
          403,
          'PAYMENT_DECISION_BLOCKED'
        );
      }
      throw new PaymentAuthorizationError(
        `Decision "${decisionId}" is not approved for payment execution.`,
        403,
        'PAYMENT_NOT_APPROVED'
      );
    }

    // 3. Amount and Currency Binding: Must match authoritative intent
    const authoritativeAmount = decision.purchaseIntent.amount;
    const authoritativeCurrency = decision.purchaseIntent.currency.toUpperCase();

    if (clientInputs?.amount !== undefined && clientInputs.amount !== null) {
      if (toMinorUnits(clientInputs.amount) !== toMinorUnits(authoritativeAmount)) {
        throw new PaymentAuthorizationError(
          `Amount mismatch: client requested $${clientInputs.amount}, but authoritative decision is approved for $${authoritativeAmount.toFixed(2)}.`,
          400,
          'AMOUNT_MISMATCH'
        );
      }
    }

    if (clientInputs?.currency && clientInputs.currency.toUpperCase() !== authoritativeCurrency) {
      throw new PaymentAuthorizationError(
        `Currency mismatch: client requested "${clientInputs.currency}", but authoritative decision is approved for "${authoritativeCurrency}".`,
        400,
        'CURRENCY_MISMATCH'
      );
    }

    // 4. Duplicate Order Check & Idempotency
    const existingPayment = await this.paymentRepo.findByDecisionId(decisionId);
    if (existingPayment) {
      if (existingPayment.status === 'COMPLETED' || existingPayment.status === 'RECONCILIATION_REQUIRED') {
        throw new PaymentAuthorizationError(
          `Payment for decision "${decisionId}" has already been captured (PayPal Capture ID: ${existingPayment.paypalCaptureId}). Duplicate orders are prohibited.`,
          409,
          'DUPLICATE_PAYMENT_PROHIBITED'
        );
      }
      if (request.retry) {
        // Cancel the previous uncompleted order to allow a freshly created PayPal order retry
        await this.paymentRepo.update(existingPayment.paymentId, {
          status: 'CANCELLED',
          failureReason: 'Cancelled to create a fresh order retry.',
        });
      } else if (
        (existingPayment.status === 'CREATED' || existingPayment.status === 'APPROVED_BY_BUYER') &&
        existingPayment.approvalUrl
      ) {
        // Return existing active order to preserve idempotency
        return {
          orderId: existingPayment.paypalOrderId,
          approvalUrl: existingPayment.approvalUrl,
          decisionId: existingPayment.decisionId,
          paymentId: existingPayment.paymentId,
          amount: existingPayment.amount,
          currency: existingPayment.currency,
          status: existingPayment.status,
        };
      }
    }

    // 5. Call PayPal Sandbox API to create order
    const description =
      request.customDescription?.trim() ||
      decision.purchaseIntent.description ||
      `PayGuard Approved: ${decision.purchaseIntent.merchantName}`;

    const returnUrl = `${config.frontendUrl}/payment/success`;
    const cancelUrl = `${config.frontendUrl}/payment/cancel`;

    const payPalOrder = await this.payPalSvc.createOrder({
      referenceId: decision.decisionId,
      amount: authoritativeAmount,
      currency: authoritativeCurrency,
      description,
      returnUrl,
      cancelUrl,
    });

    const approvalLink = payPalOrder.links.find(
      (l) => l.rel === 'approve' || l.rel === 'payer-action'
    );

    if (!approvalLink?.href) {
      throw new Error('PayPal Orders API did not return a buyer approval URL.');
    }

    // 6. Record in Payment Repository
    const paymentId = `pay_rec_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    const paymentRecord: PaymentRecord = {
      paymentId,
      decisionId: decision.decisionId,
      paypalOrderId: payPalOrder.id,
      amount: authoritativeAmount,
      currency: authoritativeCurrency,
      status: 'CREATED',
      approvalUrl: approvalLink.href,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      metadata: {
        agentId: decision.purchaseIntent.agentId,
        merchantName: decision.purchaseIntent.merchantName,
        policyVersion: decision.policyVersion,
      },
    };

    await this.paymentRepo.save(paymentRecord);

    return {
      orderId: payPalOrder.id,
      approvalUrl: approvalLink.href,
      decisionId: decision.decisionId,
      paymentId,
      amount: authoritativeAmount,
      currency: authoritativeCurrency,
      status: 'CREATED',
    };
  }

  /**
   * Server-side capture of an approved PayPal order.
   * Never marks payment as completed based only on a frontend redirect.
   */
  public async captureOrder(request: CaptureOrderRequest): Promise<CaptureOrderResult> {
    const orderId = request.orderId?.trim();
    if (!orderId) {
      throw new PaymentAuthorizationError('orderId is required to capture a payment.', 400, 'INVALID_ORDER_ID');
    }

    // 1. Verify that order was created through PayGuard flow
    const paymentRecord = await this.paymentRepo.findByOrderId(orderId);
    if (!paymentRecord) {
      throw new PaymentAuthorizationError(
        `Unknown or unauthorized PayPal Order ID "${orderId}". Order was not created through the PayGuard authorization engine.`,
        404,
        'UNKNOWN_PAYPAL_ORDER'
      );
    }

    // 2. Handle repeated/duplicate capture attempts safely
    if (paymentRecord.status === 'COMPLETED' && paymentRecord.paypalCaptureId) {
      return {
        paymentId: paymentRecord.paymentId,
        orderId: paymentRecord.paypalOrderId,
        captureId: paymentRecord.paypalCaptureId,
        decisionId: paymentRecord.decisionId,
        status: 'COMPLETED',
        amount: paymentRecord.amount,
        currency: paymentRecord.currency,
        capturedAt: paymentRecord.updatedAt,
        payerId: paymentRecord.payerId,
        payerEmail: paymentRecord.payerEmail,
      };
    }

    if (paymentRecord.status === 'RECONCILIATION_REQUIRED' && paymentRecord.paypalCaptureId) {
      const mismatch = (paymentRecord.settlementMismatch || paymentRecord.metadata?.settlementMismatch) as SettlementMismatchDetails | undefined;
      return {
        paymentId: paymentRecord.paymentId,
        orderId: paymentRecord.paypalOrderId,
        captureId: paymentRecord.paypalCaptureId,
        decisionId: paymentRecord.decisionId,
        status: 'RECONCILIATION_REQUIRED',
        amount: mismatch?.capturedAmount ?? paymentRecord.amount,
        currency: mismatch?.capturedCurrency ?? paymentRecord.currency,
        capturedAt: paymentRecord.updatedAt,
        payerId: paymentRecord.payerId,
        payerEmail: paymentRecord.payerEmail,
        reconciliationNotes: paymentRecord.failureReason || 'Settlement reconciliation required.',
        settlementMismatch: mismatch,
      };
    }

    if (paymentRecord.status === 'CANCELLED') {
      throw new PaymentAuthorizationError(`Cannot capture order "${orderId}": Order was cancelled by the buyer.`, 400, 'ORDER_CANCELLED');
    }

    // 3. CAPTURE-TIME AUTHORIZATION VERIFICATION (Phase 4.5D Hardening)
    // Before calling PayPal's capture API, verify that the associated decision exists,
    // remains APPROVED, canProceedToPayment is true, and amounts match.
    const decision = await this.decisionRepo.findById(paymentRecord.decisionId);
    if (!decision) {
      const failureReason = `Capture blocked: Authorization decision "${paymentRecord.decisionId}" was not found in repository.`;
      await this.paymentRepo.update(paymentRecord.paymentId, {
        status: 'FAILED',
        failureReason,
      });
      throw new PaymentAuthorizationError(failureReason, 403, 'AUTHORIZATION_DECISION_NOT_FOUND');
    }

    if (decision.status !== 'APPROVED' || !decision.canProceedToPayment) {
      const failureReason = `Capture blocked: Authorization decision "${decision.decisionId}" has status "${decision.status}" (canProceedToPayment: ${decision.canProceedToPayment}). Only APPROVED decisions can be captured.`;
      await this.paymentRepo.update(paymentRecord.paymentId, {
        status: 'FAILED',
        failureReason,
      });
      throw new PaymentAuthorizationError(failureReason, 403, 'PAYMENT_NOT_APPROVED');
    }

    const authAmount = decision.purchaseIntent.amount;
    const authCurrency = decision.purchaseIntent.currency.toUpperCase();
    const recordCurrency = paymentRecord.currency.toUpperCase();

    if (toMinorUnits(authAmount) !== toMinorUnits(paymentRecord.amount) || authCurrency !== recordCurrency) {
      const failureReason = `Capture blocked: Payment record amount/currency ($${paymentRecord.amount.toFixed(2)} ${recordCurrency}) does not match authorized purchase intent ($${authAmount.toFixed(2)} ${authCurrency}).`;
      await this.paymentRepo.update(paymentRecord.paymentId, {
        status: 'FAILED',
        failureReason,
      });
      throw new PaymentAuthorizationError(failureReason, 403, 'SETTLEMENT_AMOUNT_MISMATCH');
    }

    // 4. Execute server-to-server PayPal capture
    let captureResponse;
    try {
      captureResponse = await this.payPalSvc.captureOrder(orderId);
    } catch (err: unknown) {
      const failureReason =
        err instanceof PayPalApiError
          ? `[${err.errorName}] ${err.message}${err.debugId ? ` (debug_id: ${err.debugId})` : ''}`
          : err instanceof Error
            ? err.message
            : 'PayPal capture failed';
      await this.paymentRepo.update(paymentRecord.paymentId, {
        status: 'FAILED',
        failureReason,
      });
      throw err;
    }

    if (captureResponse.status !== 'COMPLETED') {
      await this.paymentRepo.update(paymentRecord.paymentId, {
        status: 'FAILED',
        failureReason: `PayPal capture returned status: ${captureResponse.status}`,
      });
      throw new Error(`PayPal order capture was not completed (Status: ${captureResponse.status}).`);
    }

    const captureUnit = captureResponse.purchase_units?.[0]?.payments?.captures?.[0];
    const captureId = captureUnit?.id;
    if (!captureId) {
      throw new Error('PayPal capture response is missing capture ID.');
    }

    const payerId = captureResponse.payer?.payer_id;
    const payerEmail = captureResponse.payer?.email_address;
    const capturedAt = captureUnit.create_time || new Date().toISOString();

    // 5. SETTLEMENT AMOUNT AND CURRENCY VERIFICATION (Phase 4.5D Hardening)
    // Extract actual capture amount and currency from PayPal response
    const rawCaptureAmount = captureUnit.amount?.value;
    const rawCaptureCurrency = captureUnit.amount?.currency_code;

    const actualCaptureUnits = toMinorUnits(rawCaptureAmount);
    const expectedAmount = paymentRecord.amount;
    const expectedUnits = toMinorUnits(expectedAmount);

    const actualCaptureCurrency = rawCaptureCurrency?.trim().toUpperCase();
    const expectedCurrency = paymentRecord.currency.trim().toUpperCase();

    // Check if amount or currency is missing, malformed, or mismatched
    const isAmountMissing = isNaN(actualCaptureUnits);
    const isCurrencyMissing = !actualCaptureCurrency;
    const isAmountMismatch = isAmountMissing || actualCaptureUnits !== expectedUnits;
    const isCurrencyMismatch = isCurrencyMissing || actualCaptureCurrency !== expectedCurrency;

    const actualCaptureAmount = isNaN(actualCaptureUnits) ? 0 : actualCaptureUnits / 100;

    if (isAmountMismatch || isCurrencyMismatch) {
      const mismatchReasons: string[] = [];
      if (isAmountMissing) {
        mismatchReasons.push('missing or invalid capture amount in PayPal response');
      } else if (actualCaptureUnits !== expectedUnits) {
        mismatchReasons.push(
          `amount mismatch (expected $${paymentRecord.amount.toFixed(2)}, captured $${actualCaptureAmount.toFixed(2)})`
        );
      }

      if (isCurrencyMissing) {
        mismatchReasons.push('missing capture currency in PayPal response');
      } else if (actualCaptureCurrency !== expectedCurrency) {
        mismatchReasons.push(
          `currency mismatch (expected ${expectedCurrency}, captured ${actualCaptureCurrency})`
        );
      }

      const summaryReason = mismatchReasons.join(' and ');
      const settlementMismatch: SettlementMismatchDetails = {
        expectedAmount: paymentRecord.amount,
        expectedCurrency,
        capturedAmount: actualCaptureAmount,
        capturedCurrency: actualCaptureCurrency || 'UNKNOWN',
        reason: summaryReason,
      };

      await this.paymentRepo.update(paymentRecord.paymentId, {
        status: 'RECONCILIATION_REQUIRED',
        paypalCaptureId: captureId,
        payerId,
        payerEmail,
        failureReason: `Settlement reconciliation required: ${summaryReason}.`,
        settlementMismatch,
        metadata: {
          ...paymentRecord.metadata,
          settlementMismatch,
          rawCaptureUnit: captureUnit,
        },
      });

      return {
        paymentId: paymentRecord.paymentId,
        orderId: paymentRecord.paypalOrderId,
        captureId,
        decisionId: paymentRecord.decisionId,
        status: 'RECONCILIATION_REQUIRED',
        amount: actualCaptureAmount,
        currency: actualCaptureCurrency || expectedCurrency,
        capturedAt,
        payerId,
        payerEmail,
        reconciliationNotes: `Settlement reconciliation required: ${summaryReason}. Funds were captured under PayPal Capture ID ${captureId}, but differ from the authorized order. Administrative reconciliation required.`,
        settlementMismatch,
      };
    }

    // 6. Normal Verified Settlement: Update audit repository
    await this.paymentRepo.update(paymentRecord.paymentId, {
      status: 'COMPLETED',
      paypalCaptureId: captureId,
      payerId,
      payerEmail,
    });

    return {
      paymentId: paymentRecord.paymentId,
      orderId: paymentRecord.paypalOrderId,
      captureId,
      decisionId: paymentRecord.decisionId,
      status: 'COMPLETED',
      amount: expectedAmount,
      currency: expectedCurrency,
      capturedAt,
      payerId,
      payerEmail,
    };
  }

  /**
   * Handle buyer cancellation redirect.
   */
  public async handleCancellation(orderId: string): Promise<PaymentRecord> {
    const paymentRecord = await this.paymentRepo.findByOrderId(orderId);
    if (!paymentRecord) {
      throw new Error(`Order ID "${orderId}" not found in payment repository.`);
    }

    if (paymentRecord.status === 'COMPLETED' || paymentRecord.status === 'RECONCILIATION_REQUIRED') {
      return paymentRecord;
    }

    const updated = await this.paymentRepo.update(paymentRecord.paymentId, {
      status: 'CANCELLED',
      failureReason: 'Buyer cancelled during PayPal Sandbox approval flow.',
    });

    return updated!;
  }

  public async getPayment(paymentId: string): Promise<PaymentRecord | null> {
    return this.paymentRepo.findById(paymentId);
  }

  public async getPaymentByOrderId(orderId: string): Promise<PaymentRecord | null> {
    return this.paymentRepo.findByOrderId(orderId);
  }

  public async listPayments(filter?: PaymentFilter): Promise<PaymentRecord[]> {
    return this.paymentRepo.list(filter);
  }
}

export const paymentService = new PaymentService();
