import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PayPalService, FetchFunction, PayPalApiError } from '../services/paypal.service';
import { PaymentService } from '../services/payment.service';
import { InMemoryPaymentRepository } from '../repositories/payment.repository';
import { InMemoryDecisionRepository } from '../repositories/decision.repository';
import { AuthorizationDecision } from '../types/authorization.types';

describe('Phase 3: PayPal Sandbox Integration Tests (Mocked HTTP)', () => {
  // Helper to create mock fetch responses
  const createMockFetch = (handlers: {
    oauthHandler?: (url: string, init?: RequestInit) => Promise<Response>;
    createOrderHandler?: (url: string, init?: RequestInit) => Promise<Response>;
    captureOrderHandler?: (url: string, init?: RequestInit) => Promise<Response>;
    getOrderHandler?: (url: string, init?: RequestInit) => Promise<Response>;
  }): FetchFunction => {
    return async (input: string | URL | any, init?: RequestInit): Promise<Response> => {
      const url = input.toString();

      if (url.includes('/v1/oauth2/token')) {
        if (handlers.oauthHandler) return handlers.oauthHandler(url, init);
        return new Response(
          JSON.stringify({
            access_token: 'mock_sandbox_access_token_xyz123',
            token_type: 'Bearer',
            app_id: 'APP-80W284485P519543T',
            expires_in: 32400,
            nonce: 'mock_nonce',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      if (url.endsWith('/capture')) {
        if (handlers.captureOrderHandler) return handlers.captureOrderHandler(url, init);
        return new Response(
          JSON.stringify({
            id: 'mock_paypal_order_7781',
            status: 'COMPLETED',
            purchase_units: [
              {
                reference_id: 'auth_dec_approved_1',
                payments: {
                  captures: [
                    {
                      id: 'mock_capture_id_9901',
                      status: 'COMPLETED',
                      amount: { currency_code: 'USD', value: '45.00' },
                      create_time: new Date().toISOString(),
                    },
                  ],
                },
              },
            ],
            payer: {
              payer_id: 'MOCK_BUYER_PAYER_ID',
              email_address: 'sb-buyer@business.example.com',
            },
          }),
          { status: 201, headers: { 'Content-Type': 'application/json' } }
        );
      }

      if (url.includes('/v2/checkout/orders') && init?.method === 'POST') {
        if (handlers.createOrderHandler) return handlers.createOrderHandler(url, init);
        return new Response(
          JSON.stringify({
            id: 'mock_paypal_order_7781',
            status: 'CREATED',
            links: [
              {
                href: 'https://www.sandbox.paypal.com/checkoutnow?token=mock_paypal_order_7781',
                rel: 'approve',
                method: 'GET',
              },
              {
                href: 'https://api-m.sandbox.paypal.com/v2/checkout/orders/mock_paypal_order_7781',
                rel: 'self',
                method: 'GET',
              },
            ],
          }),
          { status: 201, headers: { 'Content-Type': 'application/json' } }
        );
      }

      return new Response('Not Found', { status: 404 });
    };
  };

  const setupPaymentRig = (mockFetch: FetchFunction) => {
    const payPalSvc = new PayPalService(mockFetch, {
      clientId: 'valid_mock_client_id',
      clientSecret: 'valid_mock_client_secret',
      baseUrl: 'https://api-m.sandbox.paypal.com',
    });
    const paymentRepo = new InMemoryPaymentRepository();
    const decisionRepo = new InMemoryDecisionRepository();
    const paymentSvc = new PaymentService(payPalSvc, paymentRepo, decisionRepo);

    return { payPalSvc, paymentRepo, decisionRepo, paymentSvc };
  };

  describe('1. OAuth 2.0 Authentication & Token Lifecycle', () => {
    it('successfully acquires and caches OAuth 2.0 access token', async () => {
      let callCount = 0;
      const mockFetch = createMockFetch({
        oauthHandler: async () => {
          callCount++;
          return new Response(
            JSON.stringify({
              access_token: 'valid_token_abc',
              expires_in: 3600,
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        },
      });

      const { payPalSvc } = setupPaymentRig(mockFetch);
      const token1 = await payPalSvc.getAccessToken();
      const token2 = await payPalSvc.getAccessToken(); // Cached call

      assert.equal(token1, 'valid_token_abc');
      assert.equal(token2, 'valid_token_abc');
      assert.equal(callCount, 1, 'Token must be cached and not refetched on immediate second call');
    });

    it('handles 401 Unauthorized failure without leaking credentials', async () => {
      const mockFetch = createMockFetch({
        oauthHandler: async () => new Response('{"error":"invalid_client"}', { status: 401 }),
      });

      const { payPalSvc } = setupPaymentRig(mockFetch);
      await assert.rejects(
        async () => {
          await payPalSvc.getAccessToken();
        },
        (err: Error) => {
          assert.match(err.message, /PayPal authentication failed: Invalid Client ID or Client Secret/);
          assert.doesNotMatch(err.message, /valid_mock_client_secret/);
          return true;
        }
      );
    });

    it('handles malformed JSON from OAuth endpoint gracefully', async () => {
      const mockFetch = createMockFetch({
        oauthHandler: async () => new Response('<html>Error Gateway</html>', { status: 200 }),
      });

      const { payPalSvc } = setupPaymentRig(mockFetch);
      await assert.rejects(
        async () => {
          await payPalSvc.getAccessToken();
        },
        /Malformed JSON response received/
      );
    });
  });

  describe('2. Order Creation & Decision Gate Verification', () => {
    it('creates PayPal Sandbox order when decision is APPROVED', async () => {
      const mockFetch = createMockFetch({});
      const { paymentSvc, decisionRepo } = setupPaymentRig(mockFetch);

      // Seed approved decision
      const approvedDecision: AuthorizationDecision = {
        decisionId: 'auth_dec_approved_100',
        status: 'APPROVED',
        canProceedToPayment: true,
        purchaseIntent: {
          agentId: 'agent-devops-01',
          merchantName: 'GitHub Inc.',
          amount: 45.00,
          currency: 'USD',
          description: 'GitHub Copilot seat',
        },
        evaluatedAt: new Date().toISOString(),
        policyVersion: '1.0.0',
        reasonCodes: ['AUTO_APPROVAL_THRESHOLD_SATISFIED'],
        explanation: 'Approved under policy',
        policyChecks: [],
      };
      await decisionRepo.save(approvedDecision);

      const result = await paymentSvc.createOrder({
        decisionId: 'auth_dec_approved_100',
      });

      assert.equal(result.orderId, 'mock_paypal_order_7781');
      assert.equal(result.amount, 45.00);
      assert.equal(result.currency, 'USD');
      assert.equal(result.status, 'CREATED');
      assert.ok(result.approvalUrl.includes('token=mock_paypal_order_7781'));
    });

    it('rejects order creation when decision status is REVIEW_REQUIRED', async () => {
      const mockFetch = createMockFetch({});
      const { paymentSvc, decisionRepo } = setupPaymentRig(mockFetch);

      const reviewDecision: AuthorizationDecision = {
        decisionId: 'auth_dec_review_101',
        status: 'REVIEW_REQUIRED',
        canProceedToPayment: false,
        purchaseIntent: {
          agentId: 'agent-01',
          merchantName: 'Cloud Server',
          amount: 250.00,
          currency: 'USD',
        },
        evaluatedAt: new Date().toISOString(),
        policyVersion: '1.0.0',
        reasonCodes: ['AMOUNT_REQUIRES_REVIEW'],
        explanation: 'Review required',
        policyChecks: [],
      };
      await decisionRepo.save(reviewDecision);

      await assert.rejects(
        async () => {
          await paymentSvc.createOrder({ decisionId: 'auth_dec_review_101' });
        },
        /Cannot create PayPal order for a request requiring review/
      );
    });

    it('rejects order creation when decision status is BLOCKED', async () => {
      const mockFetch = createMockFetch({});
      const { paymentSvc, decisionRepo } = setupPaymentRig(mockFetch);

      const blockedDecision: AuthorizationDecision = {
        decisionId: 'auth_dec_blocked_102',
        status: 'BLOCKED',
        canProceedToPayment: false,
        purchaseIntent: {
          agentId: 'agent-01',
          merchantName: 'Crypto Vendor',
          amount: 50.00,
          currency: 'USD',
        },
        evaluatedAt: new Date().toISOString(),
        policyVersion: '1.0.0',
        reasonCodes: ['PROHIBITED_CATEGORY'],
        explanation: 'Blocked',
        policyChecks: [],
      };
      await decisionRepo.save(blockedDecision);

      await assert.rejects(
        async () => {
          await paymentSvc.createOrder({ decisionId: 'auth_dec_blocked_102' });
        },
        /Cannot create PayPal order for a BLOCKED request/
      );
    });

    it('rejects order creation when client attempts to alter amount', async () => {
      const mockFetch = createMockFetch({});
      const { paymentSvc, decisionRepo } = setupPaymentRig(mockFetch);

      const approvedDecision: AuthorizationDecision = {
        decisionId: 'auth_dec_approved_altered',
        status: 'APPROVED',
        canProceedToPayment: true,
        purchaseIntent: {
          agentId: 'agent-01',
          merchantName: 'Tooling',
          amount: 50.00,
          currency: 'USD',
        },
        evaluatedAt: new Date().toISOString(),
        policyVersion: '1.0.0',
        reasonCodes: ['AUTO_APPROVAL_THRESHOLD_SATISFIED'],
        explanation: 'Approved',
        policyChecks: [],
      };
      await decisionRepo.save(approvedDecision);

      // Client attempts to pass amount $10 instead of approved $50
      await assert.rejects(
        async () => {
          await paymentSvc.createOrder(
            { decisionId: 'auth_dec_approved_altered' },
            { amount: 10.00 }
          );
        },
        /Amount mismatch: client requested \$10, but authoritative decision is approved for \$50.00/
      );
    });

    it('rejects order creation when client attempts to alter currency', async () => {
      const mockFetch = createMockFetch({});
      const { paymentSvc, decisionRepo } = setupPaymentRig(mockFetch);

      const approvedDecision: AuthorizationDecision = {
        decisionId: 'auth_dec_approved_currency',
        status: 'APPROVED',
        canProceedToPayment: true,
        purchaseIntent: {
          agentId: 'agent-01',
          merchantName: 'Tooling',
          amount: 50.00,
          currency: 'USD',
        },
        evaluatedAt: new Date().toISOString(),
        policyVersion: '1.0.0',
        reasonCodes: ['AUTO_APPROVAL_THRESHOLD_SATISFIED'],
        explanation: 'Approved',
        policyChecks: [],
      };
      await decisionRepo.save(approvedDecision);

      // Client attempts to pass EUR instead of approved USD
      await assert.rejects(
        async () => {
          await paymentSvc.createOrder(
            { decisionId: 'auth_dec_approved_currency' },
            { currency: 'EUR' }
          );
        },
        /Currency mismatch: client requested "EUR", but authoritative decision is approved for "USD"/
      );
    });
  });

  describe('3. Server-Side Capture & Verification Flow', () => {
    it('successfully captures an approved order on the server', async () => {
      const mockFetch = createMockFetch({});
      const { paymentSvc, decisionRepo } = setupPaymentRig(mockFetch);

      const approvedDecision: AuthorizationDecision = {
        decisionId: 'auth_dec_cap_1',
        status: 'APPROVED',
        canProceedToPayment: true,
        purchaseIntent: {
          agentId: 'agent-01',
          merchantName: 'Figma Inc.',
          amount: 45.00,
          currency: 'USD',
        },
        evaluatedAt: new Date().toISOString(),
        policyVersion: '1.0.0',
        reasonCodes: ['AUTO_APPROVAL_THRESHOLD_SATISFIED'],
        explanation: 'Approved',
        policyChecks: [],
      };
      await decisionRepo.save(approvedDecision);

      const orderResult = await paymentSvc.createOrder({ decisionId: 'auth_dec_cap_1' });
      assert.equal(orderResult.status, 'CREATED');

      const captureResult = await paymentSvc.captureOrder({ orderId: orderResult.orderId });
      assert.equal(captureResult.status, 'COMPLETED');
      assert.equal(captureResult.captureId, 'mock_capture_id_9901');
      assert.equal(captureResult.payerId, 'MOCK_BUYER_PAYER_ID');
      assert.equal(captureResult.amount, 45.00);
      assert.equal(captureResult.currency, 'USD');
    });

    it('safely handles duplicate capture attempts without re-capturing', async () => {
      let captureCallCount = 0;
      const mockFetch = createMockFetch({
        captureOrderHandler: async () => {
          captureCallCount++;
          return new Response(
            JSON.stringify({
              id: 'mock_paypal_order_repeat',
              status: 'COMPLETED',
              purchase_units: [
                {
                  payments: {
                    captures: [{ id: 'mock_cap_repeat_123', status: 'COMPLETED', amount: { currency_code: 'USD', value: '45.00' } }],
                  },
                },
              ],
            }),
            { status: 201, headers: { 'Content-Type': 'application/json' } }
          );
        },
      });

      const { paymentSvc, decisionRepo } = setupPaymentRig(mockFetch);

      const approvedDecision: AuthorizationDecision = {
        decisionId: 'auth_dec_repeat_1',
        status: 'APPROVED',
        canProceedToPayment: true,
        purchaseIntent: {
          agentId: 'agent-01',
          merchantName: 'SaaS Tool',
          amount: 45.00,
          currency: 'USD',
        },
        evaluatedAt: new Date().toISOString(),
        policyVersion: '1.0.0',
        reasonCodes: ['AUTO_APPROVAL_THRESHOLD_SATISFIED'],
        explanation: 'Approved',
        policyChecks: [],
      };
      await decisionRepo.save(approvedDecision);

      const orderResult = await paymentSvc.createOrder({ decisionId: 'auth_dec_repeat_1' });
      const capture1 = await paymentSvc.captureOrder({ orderId: orderResult.orderId });
      const capture2 = await paymentSvc.captureOrder({ orderId: orderResult.orderId }); // Duplicate call

      assert.equal(capture1.status, 'COMPLETED');
      assert.equal(capture2.status, 'COMPLETED');
      assert.equal(capture2.captureId, capture1.captureId);
      assert.equal(captureCallCount, 1, 'PayPal capture endpoint must only be called once');
    });

    it('rejects capture of an unknown or mismatched order ID', async () => {
      const mockFetch = createMockFetch({});
      const { paymentSvc } = setupPaymentRig(mockFetch);

      await assert.rejects(
        async () => {
          await paymentSvc.captureOrder({ orderId: 'arbitrary_unauthorized_order_id_999' });
        },
        /Unknown or unauthorized PayPal Order ID/
      );
    });

    it('safely handles buyer cancellation and prevents subsequent capture', async () => {
      const mockFetch = createMockFetch({});
      const { paymentSvc, decisionRepo } = setupPaymentRig(mockFetch);

      const approvedDecision: AuthorizationDecision = {
        decisionId: 'auth_dec_cancel_1',
        status: 'APPROVED',
        canProceedToPayment: true,
        purchaseIntent: {
          agentId: 'agent-01',
          merchantName: 'Test Service',
          amount: 45.00,
          currency: 'USD',
        },
        evaluatedAt: new Date().toISOString(),
        policyVersion: '1.0.0',
        reasonCodes: ['AUTO_APPROVAL_THRESHOLD_SATISFIED'],
        explanation: 'Approved',
        policyChecks: [],
      };
      await decisionRepo.save(approvedDecision);

      const orderResult = await paymentSvc.createOrder({ decisionId: 'auth_dec_cancel_1' });
      const cancelled = await paymentSvc.handleCancellation(orderResult.orderId);

      assert.equal(cancelled.status, 'CANCELLED');

      await assert.rejects(
        async () => {
          await paymentSvc.captureOrder({ orderId: orderResult.orderId });
        },
        /Order was cancelled by the buyer/
      );
    });

    it('handles PayPal capture failure safely without marking payment as completed', async () => {
      const mockFetch = createMockFetch({
        captureOrderHandler: async () => {
          return new Response(JSON.stringify({ status: 'DENIED', name: 'UNPROCESSABLE_ENTITY' }), { status: 422 });
        },
      });

      const { paymentSvc, decisionRepo } = setupPaymentRig(mockFetch);

      const approvedDecision: AuthorizationDecision = {
        decisionId: 'auth_dec_fail_1',
        status: 'APPROVED',
        canProceedToPayment: true,
        purchaseIntent: {
          agentId: 'agent-01',
          merchantName: 'Declined Tool',
          amount: 45.00,
          currency: 'USD',
        },
        evaluatedAt: new Date().toISOString(),
        policyVersion: '1.0.0',
        reasonCodes: ['AUTO_APPROVAL_THRESHOLD_SATISFIED'],
        explanation: 'Approved',
        policyChecks: [],
      };
      await decisionRepo.save(approvedDecision);

      const orderResult = await paymentSvc.createOrder({ decisionId: 'auth_dec_fail_1' });

      await assert.rejects(
        async () => {
          await paymentSvc.captureOrder({ orderId: orderResult.orderId });
        },
        /PayPal order capture failed/
      );
    });
  });

  describe('4. Currency Integrity, Safe Error Handling & Checkout Retry (Regression Tests)', () => {
    it('captures safe error name, message, and debug_id from PayPal UNPROCESSABLE_ENTITY without exposing tokens', async () => {
      const mockFetch = createMockFetch({
        createOrderHandler: async () => {
          return new Response(
            JSON.stringify({
              name: 'UNPROCESSABLE_ENTITY',
              message: 'The requested action could not be performed, semantically incorrect, or failed business validation.',
              debug_id: 'paypal_dbg_currency_8819',
              details: [
                {
                  issue: 'CURRENCY_NOT_SUPPORTED_FOR_RECEIVER',
                  description: "This seller doesn't accept payments in your currency.",
                  field: "/purchase_units/@reference_id=='auth_dec_curr_1'/amount/currency_code",
                  value: 'USD',
                },
              ],
            }),
            { status: 422, headers: { 'Content-Type': 'application/json' } }
          );
        },
      });

      const { paymentSvc, decisionRepo } = setupPaymentRig(mockFetch);

      const approvedDecision: AuthorizationDecision = {
        decisionId: 'auth_dec_curr_1',
        status: 'APPROVED',
        canProceedToPayment: true,
        purchaseIntent: {
          agentId: 'agent-01',
          merchantName: 'Cloud Vendor',
          amount: 45.00,
          currency: 'USD',
        },
        evaluatedAt: new Date().toISOString(),
        policyVersion: '1.0.0',
        reasonCodes: ['AUTO_APPROVAL_THRESHOLD_SATISFIED'],
        explanation: 'Approved',
        policyChecks: [],
      };
      await decisionRepo.save(approvedDecision);

      try {
        await paymentSvc.createOrder({ decisionId: 'auth_dec_curr_1' });
        assert.fail('createOrder should have thrown PayPalApiError');
      } catch (err: unknown) {
        assert(err instanceof PayPalApiError, 'Expected err to be instance of PayPalApiError');
        assert.equal(err.errorName, 'UNPROCESSABLE_ENTITY');
        assert.equal(err.statusCode, 422);
        assert.equal(err.debugId, 'paypal_dbg_currency_8819');
        assert.equal(err.details.length, 1);
        assert.equal(err.details[0].issue, 'CURRENCY_NOT_SUPPORTED_FOR_RECEIVER');
        assert.match(err.message, /CURRENCY_NOT_SUPPORTED_FOR_RECEIVER/);
        assert.match(err.message, /paypal_dbg_currency_8819/);

        // Security check: ensure no sensitive tokens or secrets exist in the error
        assert.doesNotMatch(err.message, /mock_sandbox_access_token/);
        assert.doesNotMatch(err.message, /Bearer/);
      }
    });

    it('confirms that the order currency strictly matches the approved authorization decision', async () => {
      let interceptedPayload: any = null;

      const mockFetch = createMockFetch({
        createOrderHandler: async (_url, init) => {
          interceptedPayload = JSON.parse(init?.body as string);
          return new Response(
            JSON.stringify({
              id: 'mock_verified_currency_order',
              status: 'CREATED',
              links: [
                { href: 'https://www.sandbox.paypal.com/checkoutnow?token=mock_verified_currency_order', rel: 'approve', method: 'GET' },
              ],
            }),
            { status: 201, headers: { 'Content-Type': 'application/json' } }
          );
        },
      });

      const { paymentSvc, decisionRepo } = setupPaymentRig(mockFetch);

      const approvedDecision: AuthorizationDecision = {
        decisionId: 'auth_dec_strict_curr',
        status: 'APPROVED',
        canProceedToPayment: true,
        purchaseIntent: {
          agentId: 'agent-01',
          merchantName: 'Strict Vendor',
          amount: 45.00,
          currency: 'USD',
        },
        evaluatedAt: new Date().toISOString(),
        policyVersion: '1.0.0',
        reasonCodes: ['AUTO_APPROVAL_THRESHOLD_SATISFIED'],
        explanation: 'Approved',
        policyChecks: [],
      };
      await decisionRepo.save(approvedDecision);

      const result = await paymentSvc.createOrder({ decisionId: 'auth_dec_strict_curr' });

      assert.equal(result.currency, 'USD');
      assert.equal(result.amount, 45.00);
      assert.equal(interceptedPayload.purchase_units[0].amount.currency_code, 'USD');
      assert.equal(interceptedPayload.purchase_units[0].amount.value, '45.00');

      // Verify PayGuard pre-transaction gate refuses client attempt to tamper with currency
      await assert.rejects(
        async () => {
          await paymentSvc.createOrder(
            { decisionId: 'auth_dec_strict_curr' },
            { currency: 'EUR' }
          );
        },
        /Currency mismatch/
      );
    });

    it('allows retrying checkout with a newly created order when retry flag is passed', async () => {
      let orderCreationCount = 0;

      const mockFetch = createMockFetch({
        createOrderHandler: async () => {
          orderCreationCount += 1;
          const orderId = `mock_order_attempt_${orderCreationCount}`;
          return new Response(
            JSON.stringify({
              id: orderId,
              status: 'CREATED',
              links: [
                { href: `https://www.sandbox.paypal.com/checkoutnow?token=${orderId}`, rel: 'approve', method: 'GET' },
              ],
            }),
            { status: 201, headers: { 'Content-Type': 'application/json' } }
          );
        },
      });

      const { paymentSvc, decisionRepo, paymentRepo } = setupPaymentRig(mockFetch);

      const approvedDecision: AuthorizationDecision = {
        decisionId: 'auth_dec_retry_test',
        status: 'APPROVED',
        canProceedToPayment: true,
        purchaseIntent: {
          agentId: 'agent-01',
          merchantName: 'Retryable Merchant',
          amount: 45.00,
          currency: 'USD',
        },
        evaluatedAt: new Date().toISOString(),
        policyVersion: '1.0.0',
        reasonCodes: ['AUTO_APPROVAL_THRESHOLD_SATISFIED'],
        explanation: 'Approved',
        policyChecks: [],
      };
      await decisionRepo.save(approvedDecision);

      // Attempt 1: First order created
      const initialOrder = await paymentSvc.createOrder({ decisionId: 'auth_dec_retry_test' });
      assert.equal(initialOrder.orderId, 'mock_order_attempt_1');
      assert.equal(orderCreationCount, 1);

      // Normal duplicate call without retry flag returns existing active order (idempotent)
      const duplicateOrder = await paymentSvc.createOrder({ decisionId: 'auth_dec_retry_test' });
      assert.equal(duplicateOrder.orderId, 'mock_order_attempt_1');
      assert.equal(orderCreationCount, 1);

      // Attempt 2: Retry requested (e.g. buyer hit currency configuration issue and wishes to generate new order)
      const retriedOrder = await paymentSvc.createOrder({
        decisionId: 'auth_dec_retry_test',
        retry: true,
      });

      assert.equal(retriedOrder.orderId, 'mock_order_attempt_2');
      assert.equal(orderCreationCount, 2);

      // Confirm previous payment record is marked CANCELLED
      const previousPayment = await paymentRepo.findByOrderId('mock_order_attempt_1');
      assert.equal(previousPayment?.status, 'CANCELLED');
      assert.match(previousPayment?.failureReason || '', /retry/i);

      // Confirm old order cannot be captured
      await assert.rejects(
        async () => {
          await paymentSvc.captureOrder({ orderId: 'mock_order_attempt_1' });
        },
        /Order was cancelled/
      );
    });
  });

  describe('5. Phase 4.5D: Payment Settlement Hardening & Settlement Verification', () => {
    it('1. blocks capture when authorization decision does not exist and marks payment FAILED without calling PayPal', async () => {
      let captureCalled = false;
      const mockFetch = createMockFetch({
        captureOrderHandler: async () => {
          captureCalled = true;
          return new Response(JSON.stringify({ status: 'COMPLETED' }), { status: 200 });
        },
      });

      const { paymentSvc, paymentRepo } = setupPaymentRig(mockFetch);

      // Save a payment record referencing a non-existent decision ID
      await paymentRepo.save({
        paymentId: 'pay_orphaned_1',
        decisionId: 'auth_dec_nonexistent_999',
        paypalOrderId: 'mock_order_orphan',
        amount: 45.00,
        currency: 'USD',
        status: 'CREATED',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      await assert.rejects(
        async () => {
          await paymentSvc.captureOrder({ orderId: 'mock_order_orphan' });
        },
        /Capture blocked: Authorization decision "auth_dec_nonexistent_999" was not found in repository/
      );

      // Verify PayPal capture API was NOT called
      assert.equal(captureCalled, false, 'PayPal capture endpoint must not be contacted when decision is missing');

      // Verify payment record marked FAILED in repository
      const paymentRecord = await paymentRepo.findByOrderId('mock_order_orphan');
      assert.equal(paymentRecord?.status, 'FAILED');
      assert.match(paymentRecord?.failureReason || '', /not found in repository/);
    });

    it('2. blocks capture when authorization decision has been BLOCKED and marks payment FAILED without calling PayPal', async () => {
      let captureCalled = false;
      const mockFetch = createMockFetch({
        captureOrderHandler: async () => {
          captureCalled = true;
          return new Response(JSON.stringify({ status: 'COMPLETED' }), { status: 200 });
        },
      });

      const { paymentSvc, decisionRepo, paymentRepo } = setupPaymentRig(mockFetch);

      const decision: AuthorizationDecision = {
        decisionId: 'auth_dec_revoked_1',
        status: 'APPROVED',
        canProceedToPayment: true,
        purchaseIntent: {
          agentId: 'agent-01',
          merchantName: 'Vendor X',
          amount: 50.00,
          currency: 'USD',
        },
        evaluatedAt: new Date().toISOString(),
        policyVersion: '1.0.0',
        reasonCodes: ['AUTO_APPROVAL_THRESHOLD_SATISFIED'],
        explanation: 'Approved',
        policyChecks: [],
      };
      await decisionRepo.save(decision);

      const orderResult = await paymentSvc.createOrder({ decisionId: 'auth_dec_revoked_1' });

      // Simulate supervisor or security system subsequently BLOCKING the decision
      await decisionRepo.update('auth_dec_revoked_1', {
        status: 'BLOCKED',
        canProceedToPayment: false,
        explanation: 'Revoked by supervisor due to security review.',
      });

      await assert.rejects(
        async () => {
          await paymentSvc.captureOrder({ orderId: orderResult.orderId });
        },
        /Capture blocked: Authorization decision "auth_dec_revoked_1" has status "BLOCKED"/
      );

      // Verify PayPal capture API was NOT called
      assert.equal(captureCalled, false, 'PayPal capture endpoint must not be contacted when decision is BLOCKED');

      // Verify payment record is marked FAILED
      const paymentRecord = await paymentRepo.findByOrderId(orderResult.orderId);
      assert.equal(paymentRecord?.status, 'FAILED');
      assert.match(paymentRecord?.failureReason || '', /status "BLOCKED"/);
    });

    it('3. blocks capture when canProceedToPayment is false', async () => {
      let captureCalled = false;
      const mockFetch = createMockFetch({
        captureOrderHandler: async () => {
          captureCalled = true;
          return new Response(JSON.stringify({ status: 'COMPLETED' }), { status: 200 });
        },
      });

      const { paymentSvc, decisionRepo, paymentRepo } = setupPaymentRig(mockFetch);

      const decision: AuthorizationDecision = {
        decisionId: 'auth_dec_pending_review_1',
        status: 'REVIEW_REQUIRED',
        canProceedToPayment: false,
        purchaseIntent: {
          agentId: 'agent-01',
          merchantName: 'Vendor Y',
          amount: 250.00,
          currency: 'USD',
        },
        evaluatedAt: new Date().toISOString(),
        policyVersion: '1.0.0',
        reasonCodes: ['AMOUNT_REQUIRES_REVIEW'],
        explanation: 'Review required',
        policyChecks: [],
      };
      await decisionRepo.save(decision);

      // Save a payment record directly referencing this suspended decision
      await paymentRepo.save({
        paymentId: 'pay_pending_1',
        decisionId: 'auth_dec_pending_review_1',
        paypalOrderId: 'mock_order_pending',
        amount: 250.00,
        currency: 'USD',
        status: 'CREATED',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      await assert.rejects(
        async () => {
          await paymentSvc.captureOrder({ orderId: 'mock_order_pending' });
        },
        /canProceedToPayment: false/
      );

      assert.equal(captureCalled, false);
      const paymentRecord = await paymentRepo.findByOrderId('mock_order_pending');
      assert.equal(paymentRecord?.status, 'FAILED');
    });

    it('4. detects PayPal capture amount mismatch, marks RECONCILIATION_REQUIRED, preserves capture ID and mismatch details', async () => {
      const mockFetch = createMockFetch({
        captureOrderHandler: async () => {
          return new Response(
            JSON.stringify({
              id: 'mock_order_amt_mismatch',
              status: 'COMPLETED',
              purchase_units: [
                {
                  payments: {
                    captures: [
                      {
                        id: 'mock_cap_mismatch_amount_999',
                        status: 'COMPLETED',
                        amount: { currency_code: 'USD', value: '99.50' }, // Expected: 45.00
                        create_time: '2026-11-02T12:00:00Z',
                      },
                    ],
                  },
                },
              ],
              payer: { payer_id: 'PAYER_AMT_MISMATCH', email_address: 'buyer@test.com' },
            }),
            { status: 201, headers: { 'Content-Type': 'application/json' } }
          );
        },
      });

      const { paymentSvc, decisionRepo, paymentRepo } = setupPaymentRig(mockFetch);

      const decision: AuthorizationDecision = {
        decisionId: 'auth_dec_amt_mismatch',
        status: 'APPROVED',
        canProceedToPayment: true,
        purchaseIntent: {
          agentId: 'agent-01',
          merchantName: 'Cloud Provider',
          amount: 45.00,
          currency: 'USD',
        },
        evaluatedAt: new Date().toISOString(),
        policyVersion: '1.0.0',
        reasonCodes: ['AUTO_APPROVAL_THRESHOLD_SATISFIED'],
        explanation: 'Approved',
        policyChecks: [],
      };
      await decisionRepo.save(decision);

      const orderResult = await paymentSvc.createOrder({ decisionId: 'auth_dec_amt_mismatch' });
      assert.equal(orderResult.amount, 45.00);

      // Execute capture with PayPal returning different amount
      const captureResult = await paymentSvc.captureOrder({ orderId: orderResult.orderId });

      // Verifications:
      assert.equal(captureResult.status, 'RECONCILIATION_REQUIRED');
      assert.equal(captureResult.captureId, 'mock_cap_mismatch_amount_999');
      assert.equal(captureResult.amount, 99.50);
      assert.equal(captureResult.currency, 'USD');
      assert.match(captureResult.reconciliationNotes || '', /amount mismatch/i);

      assert(captureResult.settlementMismatch, 'Expected settlementMismatch details to be populated');
      assert.equal(captureResult.settlementMismatch.expectedAmount, 45.00);
      assert.equal(captureResult.settlementMismatch.capturedAmount, 99.50);
      assert.equal(captureResult.settlementMismatch.expectedCurrency, 'USD');
      assert.equal(captureResult.settlementMismatch.capturedCurrency, 'USD');

      // Check repository persistence
      const paymentRecord = await paymentRepo.findByOrderId(orderResult.orderId);
      assert.equal(paymentRecord?.status, 'RECONCILIATION_REQUIRED');
      assert.equal(paymentRecord?.paypalCaptureId, 'mock_cap_mismatch_amount_999');
      assert.match(paymentRecord?.failureReason || '', /Settlement reconciliation required/);
      assert.equal(paymentRecord?.settlementMismatch?.capturedAmount, 99.50);

      // Safe idempotency: Repeated capture call returns same reconciliation result
      const duplicateCapture = await paymentSvc.captureOrder({ orderId: orderResult.orderId });
      assert.equal(duplicateCapture.status, 'RECONCILIATION_REQUIRED');
      assert.equal(duplicateCapture.captureId, 'mock_cap_mismatch_amount_999');
    });

    it('5. detects PayPal capture currency mismatch, marks RECONCILIATION_REQUIRED, preserves capture ID and mismatch details', async () => {
      const mockFetch = createMockFetch({
        captureOrderHandler: async () => {
          return new Response(
            JSON.stringify({
              id: 'mock_order_curr_mismatch',
              status: 'COMPLETED',
              purchase_units: [
                {
                  payments: {
                    captures: [
                      {
                        id: 'mock_cap_mismatch_curr_888',
                        status: 'COMPLETED',
                        amount: { currency_code: 'EUR', value: '45.00' }, // Expected: USD
                        create_time: '2026-11-02T12:00:00Z',
                      },
                    ],
                  },
                },
              ],
              payer: { payer_id: 'PAYER_CURR_MISMATCH' },
            }),
            { status: 201, headers: { 'Content-Type': 'application/json' } }
          );
        },
      });

      const { paymentSvc, decisionRepo, paymentRepo } = setupPaymentRig(mockFetch);

      const decision: AuthorizationDecision = {
        decisionId: 'auth_dec_curr_mismatch',
        status: 'APPROVED',
        canProceedToPayment: true,
        purchaseIntent: {
          agentId: 'agent-01',
          merchantName: 'Global SaaS',
          amount: 45.00,
          currency: 'USD',
        },
        evaluatedAt: new Date().toISOString(),
        policyVersion: '1.0.0',
        reasonCodes: ['AUTO_APPROVAL_THRESHOLD_SATISFIED'],
        explanation: 'Approved',
        policyChecks: [],
      };
      await decisionRepo.save(decision);

      const orderResult = await paymentSvc.createOrder({ decisionId: 'auth_dec_curr_mismatch' });
      const captureResult = await paymentSvc.captureOrder({ orderId: orderResult.orderId });

      assert.equal(captureResult.status, 'RECONCILIATION_REQUIRED');
      assert.equal(captureResult.captureId, 'mock_cap_mismatch_curr_888');
      assert.equal(captureResult.currency, 'EUR');
      assert.match(captureResult.reconciliationNotes || '', /currency mismatch/i);

      assert(captureResult.settlementMismatch);
      assert.equal(captureResult.settlementMismatch.expectedCurrency, 'USD');
      assert.equal(captureResult.settlementMismatch.capturedCurrency, 'EUR');

      const paymentRecord = await paymentRepo.findByOrderId(orderResult.orderId);
      assert.equal(paymentRecord?.status, 'RECONCILIATION_REQUIRED');
      assert.equal(paymentRecord?.paypalCaptureId, 'mock_cap_mismatch_curr_888');
    });

    it('6. successfully completes capture when amount and currency strictly match', async () => {
      const mockFetch = createMockFetch({
        captureOrderHandler: async () => {
          return new Response(
            JSON.stringify({
              id: 'mock_order_exact_match',
              status: 'COMPLETED',
              purchase_units: [
                {
                  payments: {
                    captures: [
                      {
                        id: 'mock_cap_exact_777',
                        status: 'COMPLETED',
                        amount: { currency_code: 'USD', value: '45.00' },
                        create_time: '2026-11-02T12:00:00Z',
                      },
                    ],
                  },
                },
              ],
              payer: { payer_id: 'PAYER_EXACT_MATCH', email_address: 'verified@business.example.com' },
            }),
            { status: 201, headers: { 'Content-Type': 'application/json' } }
          );
        },
      });

      const { paymentSvc, decisionRepo, paymentRepo } = setupPaymentRig(mockFetch);

      const decision: AuthorizationDecision = {
        decisionId: 'auth_dec_exact_match',
        status: 'APPROVED',
        canProceedToPayment: true,
        purchaseIntent: {
          agentId: 'agent-01',
          merchantName: 'Verified Merchant',
          amount: 45.00,
          currency: 'USD',
        },
        evaluatedAt: new Date().toISOString(),
        policyVersion: '1.0.0',
        reasonCodes: ['AUTO_APPROVAL_THRESHOLD_SATISFIED'],
        explanation: 'Approved',
        policyChecks: [],
      };
      await decisionRepo.save(decision);

      const orderResult = await paymentSvc.createOrder({ decisionId: 'auth_dec_exact_match' });
      const captureResult = await paymentSvc.captureOrder({ orderId: orderResult.orderId });

      assert.equal(captureResult.status, 'COMPLETED');
      assert.equal(captureResult.amount, 45.00);
      assert.equal(captureResult.currency, 'USD');
      assert.equal(captureResult.captureId, 'mock_cap_exact_777');
      assert.equal(captureResult.settlementMismatch, undefined);

      const record = await paymentRepo.findByOrderId(orderResult.orderId);
      assert.equal(record?.status, 'COMPLETED');
      assert.equal(record?.paypalCaptureId, 'mock_cap_exact_777');
      assert.equal(record?.payerEmail, 'verified@business.example.com');
    });

    it('7. retried orders correctly identify the latest valid record in findByDecisionId and createOrder', async () => {
      let orderIndex = 0;
      const mockFetch = createMockFetch({
        createOrderHandler: async () => {
          orderIndex++;
          const orderId = `mock_retried_order_${orderIndex}`;
          return new Response(
            JSON.stringify({
              id: orderId,
              status: 'CREATED',
              links: [
                { href: `https://www.sandbox.paypal.com/checkoutnow?token=${orderId}`, rel: 'approve', method: 'GET' },
              ],
            }),
            { status: 201, headers: { 'Content-Type': 'application/json' } }
          );
        },
      });

      const { paymentSvc, decisionRepo, paymentRepo } = setupPaymentRig(mockFetch);

      const decision: AuthorizationDecision = {
        decisionId: 'auth_dec_retry_lookup_test',
        status: 'APPROVED',
        canProceedToPayment: true,
        purchaseIntent: {
          agentId: 'agent-01',
          merchantName: 'Retry Merchant',
          amount: 75.00,
          currency: 'USD',
        },
        evaluatedAt: new Date().toISOString(),
        policyVersion: '1.0.0',
        reasonCodes: ['AUTO_APPROVAL_THRESHOLD_SATISFIED'],
        explanation: 'Approved',
        policyChecks: [],
      };
      await decisionRepo.save(decision);

      // Step 1: Create initial order
      const order1 = await paymentSvc.createOrder({ decisionId: 'auth_dec_retry_lookup_test' });
      assert.equal(order1.orderId, 'mock_retried_order_1');

      // Step 2: Retry creates order 2, cancels order 1
      const order2 = await paymentSvc.createOrder({ decisionId: 'auth_dec_retry_lookup_test', retry: true });
      assert.equal(order2.orderId, 'mock_retried_order_2');

      // Step 3: Verify findByDecisionId returns order 2 (the active one), NOT order 1 (which was cancelled)
      const lookupRecord = await paymentRepo.findByDecisionId('auth_dec_retry_lookup_test');
      assert.equal(lookupRecord?.paypalOrderId, 'mock_retried_order_2');
      assert.equal(lookupRecord?.status, 'CREATED');

      // Step 4: Calling createOrder without retry flag returns existing active order 2
      const duplicateCall = await paymentSvc.createOrder({ decisionId: 'auth_dec_retry_lookup_test' });
      assert.equal(duplicateCall.orderId, 'mock_retried_order_2');
      assert.equal(orderIndex, 2, 'No 3rd PayPal order should be created');
    });

    it('8. a completed payment cannot be captured or paid again', async () => {
      let captureCount = 0;
      const mockFetch = createMockFetch({
        captureOrderHandler: async () => {
          captureCount++;
          return new Response(
            JSON.stringify({
              id: 'mock_order_already_paid',
              status: 'COMPLETED',
              purchase_units: [
                {
                  payments: {
                    captures: [
                      {
                        id: 'mock_cap_already_paid_555',
                        status: 'COMPLETED',
                        amount: { currency_code: 'USD', value: '45.00' },
                      },
                    ],
                  },
                },
              ],
            }),
            { status: 201, headers: { 'Content-Type': 'application/json' } }
          );
        },
      });

      const { paymentSvc, decisionRepo, paymentRepo } = setupPaymentRig(mockFetch);

      const decision: AuthorizationDecision = {
        decisionId: 'auth_dec_completed_guard',
        status: 'APPROVED',
        canProceedToPayment: true,
        purchaseIntent: {
          agentId: 'agent-01',
          merchantName: 'Secure Merchant',
          amount: 45.00,
          currency: 'USD',
        },
        evaluatedAt: new Date().toISOString(),
        policyVersion: '1.0.0',
        reasonCodes: ['AUTO_APPROVAL_THRESHOLD_SATISFIED'],
        explanation: 'Approved',
        policyChecks: [],
      };
      await decisionRepo.save(decision);

      const orderResult = await paymentSvc.createOrder({ decisionId: 'auth_dec_completed_guard' });
      const capture1 = await paymentSvc.captureOrder({ orderId: orderResult.orderId });
      assert.equal(capture1.status, 'COMPLETED');
      assert.equal(captureCount, 1);

      // Verify findByDecisionId prioritizes the COMPLETED record
      const found = await paymentRepo.findByDecisionId('auth_dec_completed_guard');
      assert.equal(found?.status, 'COMPLETED');

      // Attempting createOrder for this decision (even with retry: true) must throw
      await assert.rejects(
        async () => {
          await paymentSvc.createOrder({ decisionId: 'auth_dec_completed_guard', retry: true });
        },
        /Duplicate orders are prohibited/
      );

      // Repeated capture call is idempotent and does not re-call PayPal
      const capture2 = await paymentSvc.captureOrder({ orderId: orderResult.orderId });
      assert.equal(capture2.status, 'COMPLETED');
      assert.equal(captureCount, 1);
    });

    it('9. reconciliation-required order cannot be duplicated or cancelled', async () => {
      const mockFetch = createMockFetch({});
      const { paymentSvc, decisionRepo, paymentRepo } = setupPaymentRig(mockFetch);

      const decision: AuthorizationDecision = {
        decisionId: 'auth_dec_reconcile_guard',
        status: 'APPROVED',
        canProceedToPayment: true,
        purchaseIntent: {
          agentId: 'agent-01',
          merchantName: 'Disputed Merchant',
          amount: 50.00,
          currency: 'USD',
        },
        evaluatedAt: new Date().toISOString(),
        policyVersion: '1.0.0',
        reasonCodes: ['AUTO_APPROVAL_THRESHOLD_SATISFIED'],
        explanation: 'Approved',
        policyChecks: [],
      };
      await decisionRepo.save(decision);

      await paymentRepo.save({
        paymentId: 'pay_reconcile_1',
        decisionId: 'auth_dec_reconcile_guard',
        paypalOrderId: 'order_reconcile_1',
        paypalCaptureId: 'cap_reconcile_1',
        amount: 50.00,
        currency: 'USD',
        status: 'RECONCILIATION_REQUIRED',
        failureReason: 'Settlement reconciliation required: amount mismatch',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // Verify findByDecisionId identifies the RECONCILIATION_REQUIRED record
      const found = await paymentRepo.findByDecisionId('auth_dec_reconcile_guard');
      assert.equal(found?.status, 'RECONCILIATION_REQUIRED');

      // Prohibit creating duplicate orders for this decision
      await assert.rejects(
        async () => {
          await paymentSvc.createOrder({ decisionId: 'auth_dec_reconcile_guard', retry: true });
        },
        /Duplicate orders are prohibited/
      );

      // handleCancellation preserves RECONCILIATION_REQUIRED state
      const cancelResult = await paymentSvc.handleCancellation('order_reconcile_1');
      assert.equal(cancelResult.status, 'RECONCILIATION_REQUIRED');
    });

    it('10. detects missing amount in PayPal capture response and marks RECONCILIATION_REQUIRED', async () => {
      const mockFetch = createMockFetch({
        captureOrderHandler: async () => {
          return new Response(
            JSON.stringify({
              id: 'mock_order_missing_amt',
              status: 'COMPLETED',
              purchase_units: [
                {
                  payments: {
                    captures: [
                      {
                        id: 'mock_cap_missing_amt_111',
                        status: 'COMPLETED',
                        // Amount object exists but value is missing/empty
                        amount: { currency_code: 'USD', value: '' },
                        create_time: '2026-11-02T12:00:00Z',
                      },
                    ],
                  },
                },
              ],
            }),
            { status: 201, headers: { 'Content-Type': 'application/json' } }
          );
        },
      });

      const { paymentSvc, decisionRepo, paymentRepo } = setupPaymentRig(mockFetch);

      const decision: AuthorizationDecision = {
        decisionId: 'auth_dec_missing_amt',
        status: 'APPROVED',
        canProceedToPayment: true,
        purchaseIntent: {
          agentId: 'agent-01',
          merchantName: 'Vendor M',
          amount: 45.00,
          currency: 'USD',
        },
        evaluatedAt: new Date().toISOString(),
        policyVersion: '1.0.0',
        reasonCodes: ['AUTO_APPROVAL_THRESHOLD_SATISFIED'],
        explanation: 'Approved',
        policyChecks: [],
      };
      await decisionRepo.save(decision);

      const orderResult = await paymentSvc.createOrder({ decisionId: 'auth_dec_missing_amt' });
      const captureResult = await paymentSvc.captureOrder({ orderId: orderResult.orderId });

      assert.equal(captureResult.status, 'RECONCILIATION_REQUIRED');
      assert.equal(captureResult.captureId, 'mock_cap_missing_amt_111');
      assert.match(captureResult.reconciliationNotes || '', /missing or invalid capture amount/i);

      const record = await paymentRepo.findByOrderId(orderResult.orderId);
      assert.equal(record?.status, 'RECONCILIATION_REQUIRED');
      assert.equal(record?.paypalCaptureId, 'mock_cap_missing_amt_111');
    });

    it('11. detects missing currency in PayPal capture response and marks RECONCILIATION_REQUIRED', async () => {
      const mockFetch = createMockFetch({
        captureOrderHandler: async () => {
          return new Response(
            JSON.stringify({
              id: 'mock_order_missing_curr',
              status: 'COMPLETED',
              purchase_units: [
                {
                  payments: {
                    captures: [
                      {
                        id: 'mock_cap_missing_curr_222',
                        status: 'COMPLETED',
                        // Value present but currency_code missing/empty
                        amount: { currency_code: '', value: '45.00' },
                        create_time: '2026-11-02T12:00:00Z',
                      },
                    ],
                  },
                },
              ],
            }),
            { status: 201, headers: { 'Content-Type': 'application/json' } }
          );
        },
      });

      const { paymentSvc, decisionRepo, paymentRepo } = setupPaymentRig(mockFetch);

      const decision: AuthorizationDecision = {
        decisionId: 'auth_dec_missing_curr',
        status: 'APPROVED',
        canProceedToPayment: true,
        purchaseIntent: {
          agentId: 'agent-01',
          merchantName: 'Vendor C',
          amount: 45.00,
          currency: 'USD',
        },
        evaluatedAt: new Date().toISOString(),
        policyVersion: '1.0.0',
        reasonCodes: ['AUTO_APPROVAL_THRESHOLD_SATISFIED'],
        explanation: 'Approved',
        policyChecks: [],
      };
      await decisionRepo.save(decision);

      const orderResult = await paymentSvc.createOrder({ decisionId: 'auth_dec_missing_curr' });
      const captureResult = await paymentSvc.captureOrder({ orderId: orderResult.orderId });

      assert.equal(captureResult.status, 'RECONCILIATION_REQUIRED');
      assert.equal(captureResult.captureId, 'mock_cap_missing_curr_222');
      assert.match(captureResult.reconciliationNotes || '', /missing capture currency/i);

      const record = await paymentRepo.findByOrderId(orderResult.orderId);
      assert.equal(record?.status, 'RECONCILIATION_REQUIRED');
    });

    it('12. ensures currency-safe integer minor unit precision prevents floating-point inaccuracies', async () => {
      // 0.1 + 0.2 in JavaScript floating point = 0.30000000000000004
      const floatingAmount = 0.1 + 0.2; // 0.30000000000000004

      const mockFetch = createMockFetch({
        captureOrderHandler: async () => {
          return new Response(
            JSON.stringify({
              id: 'mock_order_float_precision',
              status: 'COMPLETED',
              purchase_units: [
                {
                  payments: {
                    captures: [
                      {
                        id: 'mock_cap_float_333',
                        status: 'COMPLETED',
                        amount: { currency_code: 'USD', value: '0.30' },
                        create_time: '2026-11-02T12:00:00Z',
                      },
                    ],
                  },
                },
              ],
            }),
            { status: 201, headers: { 'Content-Type': 'application/json' } }
          );
        },
      });

      const { paymentSvc, decisionRepo, paymentRepo } = setupPaymentRig(mockFetch);

      const decision: AuthorizationDecision = {
        decisionId: 'auth_dec_float_test',
        status: 'APPROVED',
        canProceedToPayment: true,
        purchaseIntent: {
          agentId: 'agent-01',
          merchantName: 'Precision Vendor',
          amount: floatingAmount, // 0.30000000000000004
          currency: 'USD',
        },
        evaluatedAt: new Date().toISOString(),
        policyVersion: '1.0.0',
        reasonCodes: ['AUTO_APPROVAL_THRESHOLD_SATISFIED'],
        explanation: 'Approved',
        policyChecks: [],
      };
      await decisionRepo.save(decision);

      const orderResult = await paymentSvc.createOrder({ decisionId: 'auth_dec_float_test' });
      // Capture matches $0.30 in minor units (30 cents)
      const captureResult = await paymentSvc.captureOrder({ orderId: orderResult.orderId });

      assert.equal(captureResult.status, 'COMPLETED');
      assert.equal(captureResult.captureId, 'mock_cap_float_333');
      const record = await paymentRepo.findByOrderId(orderResult.orderId);
      assert.equal(record?.status, 'COMPLETED');
    });
  });
});
