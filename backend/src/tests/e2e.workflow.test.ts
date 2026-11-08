import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import { AddressInfo } from 'net';
import { randomUUID } from 'crypto';
import { createApp } from '../app';
import { prisma, connectPrisma, disconnectPrisma } from '../db/prisma';
import { PrismaDecisionRepository } from '../repositories/prisma.decision.repository';
import { PrismaPaymentRepository } from '../repositories/prisma.payment.repository';
import { PurchaseIntent } from '../types/authorization.types';
import { payPalService } from '../services/paypal.service';

describe('Phase 5.2A: Full Application End-to-End Workflow Verification (STORAGE_DRIVER=postgres)', () => {
  const testPrefix = `e2e_${Date.now()}_${randomUUID().slice(0, 6)}`;
  let isDbAvailable = false;
  let server: http.Server;
  let baseUrl: string;
  let decisionRepo: PrismaDecisionRepository;
  let paymentRepo: PrismaPaymentRepository;

  function itDb(name: string, fn: (t?: any) => Promise<void> | void) {
    it(name, async (t) => {
      if (!isDbAvailable) {
        t.skip('Skipping E2E workflow test: PostgreSQL database server unreachable at localhost:5433');
        return;
      }
      await fn(t);
    });
  }

  // Track created IDs for test isolation & cleanup
  const createdDecisionIds: string[] = [];
  const createdPaymentIds: string[] = [];
  const createdOrderIds: string[] = [];

  before(async () => {
    // 1. Connect to PostgreSQL via Prisma
    try {
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Connection timeout in test')), 3000)
      );
      await Promise.race([connectPrisma(), timeoutPromise]);
      isDbAvailable = true;
      decisionRepo = new PrismaDecisionRepository(prisma);
      paymentRepo = new PrismaPaymentRepository(prisma);
    } catch {
      isDbAvailable = false;
      return;
    }

    // 2. Configure PayPal Service mock fetch to adhere strictly to safety rules
    // (Prevents spamming unnecessary PayPal sandbox orders & automatic captures per safety requirements)
    const mockPayPalFetch = async (input: string | URL | any, init?: RequestInit): Promise<Response> => {
      const url = input.toString();

      if (url.includes('/v1/oauth2/token')) {
        return new Response(
          JSON.stringify({
            access_token: 'mock_e2e_sandbox_token_abc',
            token_type: 'Bearer',
            app_id: 'APP-E2E-TEST',
            expires_in: 32400,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      if (url.includes('/v2/checkout/orders') && !url.includes('/capture')) {
        const body = init?.body ? JSON.parse(init.body as string) : {};
        const mockOrderId = `MOCK_PP_ORDER_${randomUUID().slice(0, 8)}`;
        createdOrderIds.push(mockOrderId);
        return new Response(
          JSON.stringify({
            id: mockOrderId,
            status: 'CREATED',
            intent: 'CAPTURE',
            purchase_units: body.purchase_units || [
              {
                reference_id: body.purchase_units?.[0]?.reference_id || 'ref_e2e',
                amount: body.purchase_units?.[0]?.amount || { currency_code: 'USD', value: '19.00' },
              },
            ],
            links: [
              {
                href: `https://www.sandbox.paypal.com/checkoutnow?token=${mockOrderId}`,
                rel: 'approve',
                method: 'GET',
              },
            ],
          }),
          { status: 201, headers: { 'Content-Type': 'application/json' } }
        );
      }

      if (url.includes('/capture')) {
        const mockCaptureId = `MOCK_PP_CAP_${randomUUID().slice(0, 8)}`;
        return new Response(
          JSON.stringify({
            id: 'MOCK_CAPTURED_ORDER',
            status: 'COMPLETED',
            purchase_units: [
              {
                reference_id: 'ref_e2e',
                payments: {
                  captures: [
                    {
                      id: mockCaptureId,
                      status: 'COMPLETED',
                      amount: { currency_code: 'USD', value: '19.00' },
                      create_time: new Date().toISOString(),
                    },
                  ],
                },
              },
            ],
            payer: {
              payer_id: 'PAYER_E2E_TEST',
              email_address: 'e2e-buyer@payguard.test',
            },
          }),
          { status: 201, headers: { 'Content-Type': 'application/json' } }
        );
      }

      return fetch(input, init);
    };

    payPalService.setFetchFn(mockPayPalFetch);

    // 3. Start Express app on ephemeral port
    const app = createApp();
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const addr = server.address() as AddressInfo;
        baseUrl = `http://localhost:${addr.port}`;
        resolve();
      });
    });
  });

  after(async () => {
    // Restore default fetch on payPalService
    payPalService.setFetchFn(fetch);

    // Clean up only records created during this test run
    if (isDbAvailable) {
      try {
        if (createdPaymentIds.length > 0) {
          await prisma.paymentRecord.deleteMany({
            where: { paymentId: { in: createdPaymentIds } },
          });
        }
        await prisma.paymentRecord.deleteMany({
          where: { paymentId: { contains: testPrefix } },
        });
        if (createdDecisionIds.length > 0) {
          await prisma.authorizationDecision.deleteMany({
            where: { decisionId: { in: createdDecisionIds } },
          });
        }
        await prisma.authorizationDecision.deleteMany({
          where: { decisionId: { contains: testPrefix } },
        });
      } catch {
        // Ignore cleanup error
      }
    }

    // Close server and disconnect DB
    if (server) {
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => resolve(), 1000);
        server.close(() => {
          clearTimeout(timer);
          resolve();
        });
        if (typeof (server as any).closeAllConnections === 'function') {
          (server as any).closeAllConnections();
        }
      });
    }
    if (isDbAvailable) {
      await disconnectPrisma();
    }
  });

  itDb('Step 1 & 2: Backend health endpoint and API metadata are responsive', async () => {
    // 1. Check /api/health
    const healthRes = await fetch(`${baseUrl}/api/health`);
    assert.equal(healthRes.status, 200);
    const healthJson = (await healthRes.json()) as any;
    assert.equal(healthJson.success, true);
    assert.equal(healthJson.data.status, 'healthy');
    assert.equal(healthJson.data.service, 'payguard-ai-backend');
    assert.equal(healthJson.data.checks.system, 'operational');

    // 2. Check /api metadata
    const apiRes = await fetch(`${baseUrl}/api`);
    assert.equal(apiRes.status, 200);
    const apiJson = (await apiRes.json()) as any;
    assert.ok(apiJson.endpoints);
    assert.equal(apiJson.endpoints.health, '/api/health');
    assert.equal(apiJson.endpoints.evaluateAuthorization, '/api/authorization/evaluate');
    assert.equal(apiJson.endpoints.createPaymentOrder, '/api/payments/create-order');
    assert.equal(apiJson.endpoints.parseIntent, '/api/agent/parse-intent');
    assert.equal(apiJson.endpoints.discoverProducts, '/api/agent/discover');
  });

  itDb('Step 3 & 4: Natural-language purchase request & Groq intent extraction', async () => {
    const parseRes = await fetch(`${baseUrl}/api/agent/parse-intent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'I want to purchase a GitHub Copilot Business subscription for $19.00 USD from github.com, team budget is $50, for agent-lead-1',
      }),
    });

    assert.equal(parseRes.status, 200);
    const parseJson = (await parseRes.json()) as any;
    assert.equal(parseJson.success, true);
    assert.ok(parseJson.data?.intent);

    const intent = parseJson.data.intent;
    // Verify structured extraction
    assert.equal(typeof intent.amount, 'number');
    assert.equal(intent.amount, 19);
    assert.equal(intent.currency, 'USD');
    assert.ok(intent.merchant?.toLowerCase().includes('github'));
    assert.equal(intent.domain?.toLowerCase(), 'github.com');
  });

  itDb('Step 5: Tavily merchant and product discovery', async () => {
    const discoverRes = await fetch(`${baseUrl}/api/agent/discover`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'GitHub Copilot Business subscription',
        maxResults: 2,
      }),
    });

    assert.equal(discoverRes.status, 200);
    const discoverJson = (await discoverRes.json()) as any;
    assert.equal(discoverJson.success, true);
    assert.ok(Array.isArray(discoverJson.data?.results));
    assert.ok(discoverJson.data.results.length > 0);

    const firstResult = discoverJson.data.results[0];
    assert.ok(firstResult.title);
    assert.ok(firstResult.sourceUrl);
  });

  let approvedDecisionId = '';
  let reviewRequiredDecisionId = '';
  let blockedDecisionId = '';

  itDb('Step 6, 7 & 8A: Deterministic authorization -> Outcome APPROVED (<= $100)', async () => {
    const purchaseIntent: PurchaseIntent = {
      id: `intent_${testPrefix}_approved`,
      agentId: 'agent-devops-01',
      merchantName: 'GitHub',
      merchantDomain: 'github.com',
      category: 'Developer Tools',
      amount: 19.00,
      currency: 'USD',
      description: 'GitHub Copilot Business individual seat',
      userBudgetLimit: 50.00,
    };

    const evalRes = await fetch(`${baseUrl}/api/authorization/evaluate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(purchaseIntent),
    });

    assert.equal(evalRes.status, 200);
    const evalJson = (await evalRes.json()) as any;
    assert.equal(evalJson.success, true);

    const decision = evalJson.data;
    approvedDecisionId = decision.decisionId;
    createdDecisionIds.push(approvedDecisionId);

    assert.equal(decision.status, 'APPROVED');
    assert.equal(decision.canProceedToPayment, true);
    assert.ok(decision.reasonCodes.includes('AUTO_APPROVAL_THRESHOLD_SATISFIED'));

    // Verify stored in PostgreSQL database
    const dbRecord = await decisionRepo.findById(approvedDecisionId);
    assert.ok(dbRecord);
    assert.equal(dbRecord?.status, 'APPROVED');
    assert.equal(dbRecord?.canProceedToPayment, true);
    assert.equal(dbRecord?.purchaseIntent.amount, 19.00);
  });

  itDb('Step 7 & 8B: Deterministic authorization -> Outcome REVIEW_REQUIRED ($100 - $500)', async () => {
    const purchaseIntent: PurchaseIntent = {
      id: `intent_${testPrefix}_review`,
      agentId: 'agent-designer-02',
      merchantName: 'Figma Inc',
      merchantDomain: 'figma.com',
      category: 'Design & Creative',
      amount: 350.00,
      currency: 'USD',
      description: 'Annual team design workspace subscription',
      userBudgetLimit: 500.00,
    };

    const evalRes = await fetch(`${baseUrl}/api/authorization/evaluate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(purchaseIntent),
    });

    assert.equal(evalRes.status, 200);
    const evalJson = (await evalRes.json()) as any;
    assert.equal(evalJson.success, true);

    const decision = evalJson.data;
    reviewRequiredDecisionId = decision.decisionId;
    createdDecisionIds.push(reviewRequiredDecisionId);

    assert.equal(decision.status, 'REVIEW_REQUIRED');
    assert.equal(decision.canProceedToPayment, false);
    assert.ok(decision.reasonCodes.includes('AMOUNT_REQUIRES_REVIEW'));

    // Verify stored in PostgreSQL database
    const dbRecord = await decisionRepo.findById(reviewRequiredDecisionId);
    assert.ok(dbRecord);
    assert.equal(dbRecord?.status, 'REVIEW_REQUIRED');
    assert.equal(dbRecord?.canProceedToPayment, false);
    assert.equal(dbRecord?.purchaseIntent.amount, 350.00);
  });

  itDb('Step 7 & 8C: Deterministic authorization -> Outcome BLOCKED (Prohibited Category/Domain)', async () => {
    const purchaseIntent: PurchaseIntent = {
      id: `intent_${testPrefix}_blocked`,
      agentId: 'agent-rogue-03',
      merchantName: 'Online Casino',
      merchantDomain: 'casino-roulette.example',
      category: 'Gambling',
      amount: 50.00,
      currency: 'USD',
      description: 'Unauthorized gambling token purchase',
      userBudgetLimit: 100.00,
    };

    const evalRes = await fetch(`${baseUrl}/api/authorization/evaluate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(purchaseIntent),
    });

    assert.equal(evalRes.status, 200);
    const evalJson = (await evalRes.json()) as any;
    assert.equal(evalJson.success, true);

    const decision = evalJson.data;
    blockedDecisionId = decision.decisionId;
    createdDecisionIds.push(blockedDecisionId);

    assert.equal(decision.status, 'BLOCKED');
    assert.equal(decision.canProceedToPayment, false);
    assert.ok(decision.reasonCodes.includes('PROHIBITED_CATEGORY'));

    // Verify stored in PostgreSQL database
    const dbRecord = await decisionRepo.findById(blockedDecisionId);
    assert.ok(dbRecord);
    assert.equal(dbRecord?.status, 'BLOCKED');
    assert.equal(dbRecord?.canProceedToPayment, false);
  });

  itDb('Step 9A: Supervisor approval transition on REVIEW_REQUIRED decision', async () => {
    const reviewRes = await fetch(`${baseUrl}/api/authorization/decisions/${reviewRequiredDecisionId}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'APPROVE',
        reviewerId: 'supervisor_alice',
        notes: 'Verified team Figma requirements for upcoming sprint.',
      }),
    });

    assert.equal(reviewRes.status, 200);
    const reviewJson = (await reviewRes.json()) as any;
    assert.equal(reviewJson.success, true);
    assert.equal(reviewJson.data.status, 'APPROVED');
    assert.equal(reviewJson.data.canProceedToPayment, true);
    assert.equal(reviewJson.data.reviewMetadata?.reviewedBy, 'supervisor_alice');
    assert.equal(reviewJson.data.reviewMetadata?.reviewNotes, 'Verified team Figma requirements for upcoming sprint.');
    assert.equal(reviewJson.data.reviewMetadata?.reviewDecision, 'MANUALLY_APPROVED');

    // Verify state transition persisted in PostgreSQL
    const dbRecord = await decisionRepo.findById(reviewRequiredDecisionId);
    assert.equal(dbRecord?.status, 'APPROVED');
    assert.equal(dbRecord?.canProceedToPayment, true);
    assert.equal(dbRecord?.reviewMetadata?.reviewedBy, 'supervisor_alice');
  });

  let rejectedDecisionId = '';

  itDb('Step 9B: Supervisor rejection transition on REVIEW_REQUIRED decision', async () => {
    // First create a new decision in REVIEW_REQUIRED
    const purchaseIntent: PurchaseIntent = {
      id: `intent_${testPrefix}_reject`,
      agentId: 'agent-dev-04',
      merchantName: 'Unknown SaaS',
      amount: 400.00,
      currency: 'USD',
      description: 'Experimental tool license',
      userBudgetLimit: 500.00,
    };

    const evalRes = await fetch(`${baseUrl}/api/authorization/evaluate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(purchaseIntent),
    });
    const evalJson = (await evalRes.json()) as any;
    rejectedDecisionId = evalJson.data.decisionId;
    createdDecisionIds.push(rejectedDecisionId);

    // Reject via supervisor sign-off
    const reviewRes = await fetch(`${baseUrl}/api/authorization/decisions/${rejectedDecisionId}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'REJECT',
        reviewerId: 'supervisor_bob',
        notes: 'Software license not approved by IT security.',
      }),
    });

    assert.equal(reviewRes.status, 200);
    const reviewJson = (await reviewRes.json()) as any;
    assert.equal(reviewJson.success, true);
    assert.equal(reviewJson.data.status, 'BLOCKED');
    assert.equal(reviewJson.data.canProceedToPayment, false);
    assert.equal(reviewJson.data.reviewMetadata?.reviewedBy, 'supervisor_bob');
    assert.equal(reviewJson.data.reviewMetadata?.reviewDecision, 'MANUALLY_REJECTED');
    assert.equal(reviewJson.data.reviewMetadata?.reviewNotes, 'Software license not approved by IT security.');

    // Verify state transition in PostgreSQL
    const dbRecord = await decisionRepo.findById(rejectedDecisionId);
    assert.equal(dbRecord?.status, 'BLOCKED');
    assert.equal(dbRecord?.canProceedToPayment, false);
    assert.equal(dbRecord?.reviewMetadata?.reviewDecision, 'MANUALLY_REJECTED');
  });

  itDb('Step 10 & 11: Payment Security Gate strictly rejects unapproved decisions', async () => {
    // 1. Attempt to create PayPal order for BLOCKED decision
    const blockedOrderRes = await fetch(`${baseUrl}/api/payments/create-order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decisionId: blockedDecisionId }),
    });
    assert.equal(blockedOrderRes.status, 403);
    const blockedJson = (await blockedOrderRes.json()) as any;
    assert.equal(blockedJson.success, false);
    assert.ok(
      blockedJson.error?.message?.includes('BLOCKED') ||
      blockedJson.error?.message?.includes('not approved')
    );

    // 2. Attempt to create PayPal order for REJECTED decision
    const rejectedOrderRes = await fetch(`${baseUrl}/api/payments/create-order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decisionId: rejectedDecisionId }),
    });
    assert.equal(rejectedOrderRes.status, 403);
    const rejectedJson = (await rejectedOrderRes.json()) as any;
    assert.equal(rejectedJson.success, false);

    // 3. Create a fresh REVIEW_REQUIRED decision and attempt order creation
    const freshReviewIntent: PurchaseIntent = {
      id: `intent_${testPrefix}_pending_gate`,
      agentId: 'agent-bot',
      merchantName: 'Cloud Server Hosting',
      amount: 250.00,
      currency: 'USD',
      description: 'Compute nodes',
      userBudgetLimit: 300.00,
    };
    const gateRes = await fetch(`${baseUrl}/api/authorization/evaluate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(freshReviewIntent),
    });
    const gateJson = (await gateRes.json()) as any;
    const pendingDecisionId = gateJson.data.decisionId;
    createdDecisionIds.push(pendingDecisionId);

    const pendingOrderRes = await fetch(`${baseUrl}/api/payments/create-order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decisionId: pendingDecisionId }),
    });
    assert.equal(pendingOrderRes.status, 403);
    const pendingOrderJson = (await pendingOrderRes.json()) as any;
    assert.equal(pendingOrderJson.success, false);
    assert.ok(
      pendingOrderJson.error?.message?.includes('review') ||
      pendingOrderJson.error?.message?.includes('not approved')
    );
  });

  let createdPayPalOrderId = '';
  let createdPaymentRecordId = '';

  itDb('Step 10, 12: Checkout succeeds for valid APPROVED decision, saves to PostgreSQL & preserves idempotency', async () => {
    // 1. Create PayPal Order for valid APPROVED decision
    const orderRes = await fetch(`${baseUrl}/api/payments/create-order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        decisionId: approvedDecisionId,
        customDescription: 'Authorized GitHub Copilot Enterprise Seat',
      }),
    });

    assert.equal(orderRes.status, 200);
    const orderJson = (await orderRes.json()) as any;
    assert.equal(orderJson.success, true);
    assert.ok(orderJson.data?.orderId);
    assert.ok(orderJson.data?.approvalUrl);
    assert.equal(orderJson.data?.decisionId, approvedDecisionId);
    assert.equal(orderJson.data?.status, 'CREATED');

    createdPayPalOrderId = orderJson.data.orderId;
    createdPaymentRecordId = orderJson.data.paymentId;
    createdPaymentIds.push(createdPaymentRecordId);

    // Verify stored in PostgreSQL
    const dbPayment = await paymentRepo.findByOrderId(createdPayPalOrderId);
    assert.ok(dbPayment);
    assert.equal(dbPayment?.paypalOrderId, createdPayPalOrderId);
    assert.equal(dbPayment?.decisionId, approvedDecisionId);
    assert.equal(dbPayment?.status, 'CREATED');
    assert.equal(dbPayment?.amount, 19.00);

    // 2. Test Idempotency: Second call to create-order returns the existing active order without duplicates
    const duplicateOrderRes = await fetch(`${baseUrl}/api/payments/create-order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decisionId: approvedDecisionId }),
    });
    assert.equal(duplicateOrderRes.status, 200);
    const duplicateJson = (await duplicateOrderRes.json()) as any;
    assert.equal(duplicateJson.success, true);
    assert.equal(duplicateJson.data.orderId, createdPayPalOrderId);
    assert.equal(duplicateJson.data.paymentId, createdPaymentRecordId);

    // 3. Test Capture Order
    const captureRes = await fetch(`${baseUrl}/api/payments/capture-order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId: createdPayPalOrderId }),
    });
    assert.equal(captureRes.status, 200);
    const captureJson = (await captureRes.json()) as any;
    assert.equal(captureJson.success, true);
    assert.equal(captureJson.data.status, 'COMPLETED');
    assert.ok(captureJson.data.captureId);

    // Verify updated to COMPLETED in PostgreSQL
    const settledDbPayment = await paymentRepo.findByOrderId(createdPayPalOrderId);
    assert.equal(settledDbPayment?.status, 'COMPLETED');
    assert.ok(settledDbPayment?.paypalCaptureId);
    assert.ok(settledDbPayment?.updatedAt);
    assert.ok(captureJson.data.capturedAt);
  });

  itDb('Step 13: Decisions and payment records persist after simulated backend restart', async () => {
    // Simulate application reboot by creating brand new repository instances
    const freshDecisionRepo = new PrismaDecisionRepository(prisma);
    const freshPaymentRepo = new PrismaPaymentRepository(prisma);

    // 1. Verify approved decision persisted
    const decision = await freshDecisionRepo.findById(approvedDecisionId);
    assert.ok(decision);
    assert.equal(decision?.decisionId, approvedDecisionId);
    assert.equal(decision?.status, 'APPROVED');
    assert.equal(decision?.canProceedToPayment, true);
    assert.equal(decision?.purchaseIntent.merchantName, 'GitHub');
    assert.equal(decision?.purchaseIntent.amount, 19.00);

    // 2. Verify reviewed decision persisted with reviewer sign-off details
    const reviewed = await freshDecisionRepo.findById(reviewRequiredDecisionId);
    assert.ok(reviewed);
    assert.equal(reviewed?.status, 'APPROVED');
    assert.equal(reviewed?.reviewMetadata?.reviewedBy, 'supervisor_alice');
    assert.equal(reviewed?.reviewMetadata?.reviewNotes, 'Verified team Figma requirements for upcoming sprint.');

    // 3. Verify rejected decision persisted
    const rejected = await freshDecisionRepo.findById(rejectedDecisionId);
    assert.ok(rejected);
    assert.equal(rejected?.status, 'BLOCKED');
    assert.equal(rejected?.canProceedToPayment, false);
    assert.equal(rejected?.reviewMetadata?.reviewDecision, 'MANUALLY_REJECTED');

    // 4. Verify completed payment persisted in PostgreSQL
    const payment = await freshPaymentRepo.findByOrderId(createdPayPalOrderId);
    assert.ok(payment);
    assert.equal(payment?.status, 'COMPLETED');
    assert.equal(payment?.decisionId, approvedDecisionId);
    assert.equal(payment?.amount, 19.00);
  });

  itDb('Step 14: Transaction history and dashboard views load correctly from PostgreSQL', async () => {
    // 1. GET /api/authorization/decisions
    const decisionsRes = await fetch(`${baseUrl}/api/authorization/decisions`);
    assert.equal(decisionsRes.status, 200);
    const decisionsJson = (await decisionsRes.json()) as any;
    assert.equal(decisionsJson.success, true);
    assert.equal(decisionsJson.storageType, 'POSTGRESQL_PRISMA_STORE');
    assert.ok(Array.isArray(decisionsJson.data));
    assert.ok(decisionsJson.data.some((d: any) => d.decisionId === approvedDecisionId));

    // 2. GET /api/payments
    const paymentsRes = await fetch(`${baseUrl}/api/payments`);
    assert.equal(paymentsRes.status, 200);
    const paymentsJson = (await paymentsRes.json()) as any;
    assert.equal(paymentsJson.success, true);
    assert.equal(paymentsJson.storageType, 'POSTGRESQL_PRISMA_PAYMENT_STORE');
    assert.ok(Array.isArray(paymentsJson.data));
    assert.ok(paymentsJson.data.some((p: any) => p.paypalOrderId === createdPayPalOrderId));

    // 3. Verify summary metric counts from real PostgreSQL dataset
    const allDecisions = decisionsJson.data;
    const approvedCount = allDecisions.filter((d: any) => d.status === 'APPROVED').length;
    const blockedCount = allDecisions.filter((d: any) => d.status === 'BLOCKED').length;
    const pendingCount = allDecisions.filter((d: any) => d.status === 'REVIEW_REQUIRED').length;

    assert.ok(approvedCount >= 2); // our 2 approved decisions
    assert.ok(blockedCount >= 1);  // our 1 blocked decision
    assert.ok(allDecisions.length >= 4);
  });
});
