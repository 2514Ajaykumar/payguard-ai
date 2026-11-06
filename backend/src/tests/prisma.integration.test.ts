import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'crypto';
import { prisma, connectPrisma, disconnectPrisma } from '../db/prisma';
import { PrismaDecisionRepository } from '../repositories/prisma.decision.repository';
import { PrismaPaymentRepository } from '../repositories/prisma.payment.repository';
import { AuthorizationDecision } from '../types/authorization.types';
import { PaymentRecord } from '../types/payment.types';

describe('Phase 5.1C: Real PostgreSQL Database Integration Tests', () => {
  const testPrefix = `test_${Date.now()}_${randomUUID().slice(0, 6)}`;
  let decisionRepo: PrismaDecisionRepository;
  let paymentRepo: PrismaPaymentRepository;

  before(async () => {
    await connectPrisma();
    decisionRepo = new PrismaDecisionRepository(prisma);
    paymentRepo = new PrismaPaymentRepository(prisma);
  });

  after(async () => {
    // Clean up only records created during this test run, never existing data
    try {
      await prisma.paymentRecord.deleteMany({
        where: { paymentId: { contains: testPrefix } },
      });
      await prisma.authorizationDecision.deleteMany({
        where: { decisionId: { contains: testPrefix } },
      });
    } catch {
      // Ignore cleanup error if any
    }
    await disconnectPrisma();
  });

  it('1. Saves and retrieves an authorization decision from PostgreSQL', async () => {
    const decisionId = `auth_dec_${testPrefix}_01`;
    const decision: AuthorizationDecision = {
      decisionId,
      status: 'APPROVED',
      canProceedToPayment: true,
      purchaseIntent: {
        id: `intent_${testPrefix}_01`,
        agentId: 'agent-devops-ci',
        merchantName: 'Cloud Infrastructure Provider',
        merchantDomain: 'cloudinfra.internal',
        category: 'Cloud Services',
        amount: 89.50,
        currency: 'USD',
        description: 'Automated CI cluster monthly allocation',
        userBudgetLimit: 150.00,
        metadata: { tier: 'standard', cluster: 'us-east-1' },
      },
      evaluatedAt: new Date().toISOString(),
      policyVersion: '1.0.0',
      reasonCodes: ['AUTO_APPROVAL_THRESHOLD_SATISFIED'],
      explanation: 'Pre-transaction policy checks passed successfully.',
      policyChecks: [
        { checkName: 'AMOUNT_VALIDATION', status: 'PASSED', message: 'Amount $89.50 is positive' },
        { checkName: 'CURRENCY_SUPPORTED', status: 'PASSED', message: 'USD is supported' },
      ],
    };

    const saved = await decisionRepo.save(decision);
    assert.equal(saved.decisionId, decisionId);

    const retrieved = await decisionRepo.findById(decisionId);
    assert.ok(retrieved);
    assert.equal(retrieved?.decisionId, decisionId);
    assert.equal(retrieved?.status, 'APPROVED');
    assert.equal(retrieved?.canProceedToPayment, true);
    assert.equal(typeof retrieved?.purchaseIntent.amount, 'number');
    assert.equal(retrieved?.purchaseIntent.amount, 89.50);
    assert.equal(retrieved?.purchaseIntent.userBudgetLimit, 150.00);
    assert.equal(retrieved?.purchaseIntent.currency, 'USD');
    assert.equal(retrieved?.policyChecks.length, 2);
  });

  it('2. Updates supervisor review information in PostgreSQL', async () => {
    const decisionId = `auth_dec_${testPrefix}_02`;
    const initialDecision: AuthorizationDecision = {
      decisionId,
      status: 'REVIEW_REQUIRED',
      canProceedToPayment: false,
      purchaseIntent: {
        id: `intent_${testPrefix}_02`,
        agentId: 'procurement-bot-2',
        merchantName: 'Enterprise SaaS',
        amount: 450.00,
        currency: 'USD',
        description: 'Team license upgrade',
      },
      evaluatedAt: new Date().toISOString(),
      policyVersion: '1.0.0',
      reasonCodes: ['AMOUNT_REQUIRES_REVIEW'],
      explanation: 'Purchase of $450.00 requires supervisor sign-off.',
      policyChecks: [
        { checkName: 'SPENDING_THRESHOLD_TIER', status: 'WARNING', message: 'Amount requires review' },
      ],
    };

    await decisionRepo.save(initialDecision);

    const updated = await decisionRepo.update(decisionId, {
      status: 'APPROVED',
      explanation: 'Manually approved by supervisor Alice.',
      reviewMetadata: {
        reviewedBy: 'supervisor_alice',
        reviewedAt: new Date().toISOString(),
        reviewDecision: 'MANUALLY_APPROVED',
        reviewNotes: 'Verified emergency license expansion ticket',
      },
    });

    assert.ok(updated);
    assert.equal(updated?.status, 'APPROVED');
    assert.equal(updated?.canProceedToPayment, true);
    assert.equal(updated?.reviewMetadata?.reviewedBy, 'supervisor_alice');
    assert.equal(updated?.reviewMetadata?.reviewDecision, 'MANUALLY_APPROVED');

    // Retrieve directly from DB to confirm persistence
    const reFetched = await decisionRepo.findById(decisionId);
    assert.equal(reFetched?.status, 'APPROVED');
    assert.equal(reFetched?.canProceedToPayment, true);
    assert.equal(reFetched?.reviewMetadata?.reviewedBy, 'supervisor_alice');
  });

  it('3. Saves and retrieves a payment record from PostgreSQL', async () => {
    const decisionId = `auth_dec_${testPrefix}_03`;
    await decisionRepo.save({
      decisionId,
      status: 'APPROVED',
      canProceedToPayment: true,
      purchaseIntent: {
        agentId: 'bot-03',
        merchantName: 'GitHub Inc.',
        amount: 50.00,
        currency: 'USD',
      },
      evaluatedAt: new Date().toISOString(),
      policyVersion: '1.0.0',
      reasonCodes: ['APPROVED'],
      explanation: 'Approved',
      policyChecks: [],
    });

    const paymentId = `pay_rec_${testPrefix}_03`;
    const orderId = `PAYPAL_ORD_${testPrefix}_03`;
    const paymentRecord: PaymentRecord = {
      paymentId,
      decisionId,
      paypalOrderId: orderId,
      amount: 50.00,
      currency: 'USD',
      status: 'CREATED',
      approvalUrl: `https://sandbox.paypal.com/checkout?token=${orderId}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      metadata: { initiatedBy: 'agent' },
    };

    await paymentRepo.save(paymentRecord);

    const byId = await paymentRepo.findById(paymentId);
    assert.ok(byId);
    assert.equal(byId?.paymentId, paymentId);
    assert.equal(byId?.paypalOrderId, orderId);
    assert.equal(byId?.status, 'CREATED');
    assert.equal(byId?.amount, 50.00);
    assert.equal(typeof byId?.amount, 'number');

    const byOrder = await paymentRepo.findByOrderId(orderId);
    assert.ok(byOrder);
    assert.equal(byOrder?.paymentId, paymentId);
  });

  it('4. Preserves payment records across new repository instances (application restart simulation)', async () => {
    const decisionId = `auth_dec_${testPrefix}_04`;
    await decisionRepo.save({
      decisionId,
      status: 'APPROVED',
      canProceedToPayment: true,
      purchaseIntent: {
        agentId: 'bot-04',
        merchantName: 'Linode',
        amount: 25.00,
        currency: 'USD',
      },
      evaluatedAt: new Date().toISOString(),
      policyVersion: '1.0.0',
      reasonCodes: ['APPROVED'],
      explanation: 'Approved',
      policyChecks: [],
    });

    const paymentId = `pay_rec_${testPrefix}_04`;
    const orderId = `PAYPAL_ORD_${testPrefix}_04`;
    await paymentRepo.save({
      paymentId,
      decisionId,
      paypalOrderId: orderId,
      paypalCaptureId: `CAPTURE_${testPrefix}_04`,
      amount: 25.00,
      currency: 'USD',
      status: 'COMPLETED',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Simulate complete application restart by instantiating fresh repository instances
    const freshDecisionRepo = new PrismaDecisionRepository(prisma);
    const freshPaymentRepo = new PrismaPaymentRepository(prisma);

    const reloadedPayment = await freshPaymentRepo.findById(paymentId);
    assert.ok(reloadedPayment);
    assert.equal(reloadedPayment?.paymentId, paymentId);
    assert.equal(reloadedPayment?.status, 'COMPLETED');
    assert.equal(reloadedPayment?.paypalCaptureId, `CAPTURE_${testPrefix}_04`);
    assert.equal(reloadedPayment?.amount, 25.00);

    const reloadedDecision = await freshDecisionRepo.findById(decisionId);
    assert.ok(reloadedDecision);
    assert.equal(reloadedDecision?.decisionId, decisionId);
  });

  it('5. Enforces database partial unique index: at most one settled payment per decision', async () => {
    const decisionId = `auth_dec_${testPrefix}_05`;
    await decisionRepo.save({
      decisionId,
      status: 'APPROVED',
      canProceedToPayment: true,
      purchaseIntent: {
        agentId: 'bot-05',
        merchantName: 'Stripe',
        amount: 30.00,
        currency: 'USD',
      },
      evaluatedAt: new Date().toISOString(),
      policyVersion: '1.0.0',
      reasonCodes: ['APPROVED'],
      explanation: 'Approved',
      policyChecks: [],
    });

    // First settled payment
    await paymentRepo.save({
      paymentId: `pay_settled_1_${testPrefix}`,
      decisionId,
      paypalOrderId: `ORD_SETTLED_1_${testPrefix}`,
      paypalCaptureId: `CAP_SETTLED_1_${testPrefix}`,
      amount: 30.00,
      currency: 'USD',
      status: 'COMPLETED',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Second settled payment for the same decision MUST fail at the database level
    await assert.rejects(
      async () => {
        await paymentRepo.save({
          paymentId: `pay_settled_2_${testPrefix}`,
          decisionId,
          paypalOrderId: `ORD_SETTLED_2_${testPrefix}`,
          paypalCaptureId: `CAP_SETTLED_2_${testPrefix}`,
          amount: 30.00,
          currency: 'USD',
          status: 'COMPLETED',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      },
      (err: any) => {
        // Prisma throws P2002 for unique constraint violations
        const message = err?.message || '';
        const isUniqueViolation =
          err?.code === 'P2002' ||
          message.includes('Unique constraint failed') ||
          message.includes('payment_records_decision_settled_idx');
        return isUniqueViolation;
      }
    );
  });

  it('6. Preserves idempotency precedence in findByDecisionId across mixed statuses', async () => {
    const decisionId = `auth_dec_${testPrefix}_06`;
    await decisionRepo.save({
      decisionId,
      status: 'APPROVED',
      canProceedToPayment: true,
      purchaseIntent: {
        agentId: 'bot-06',
        merchantName: 'Vercel',
        amount: 20.00,
        currency: 'USD',
      },
      evaluatedAt: new Date().toISOString(),
      policyVersion: '1.0.0',
      reasonCodes: ['APPROVED'],
      explanation: 'Approved',
      policyChecks: [],
    });

    // 1. Initial attempt: CANCELLED
    await paymentRepo.save({
      paymentId: `pay_hist_1_${testPrefix}`,
      decisionId,
      paypalOrderId: `ORD_HIST_1_${testPrefix}`,
      amount: 20.00,
      currency: 'USD',
      status: 'CANCELLED',
      createdAt: new Date(Date.now() - 60000).toISOString(),
      updatedAt: new Date(Date.now() - 50000).toISOString(),
    });

    // 2. Successful capture: COMPLETED
    const completedPaymentId = `pay_hist_2_${testPrefix}`;
    await paymentRepo.save({
      paymentId: completedPaymentId,
      decisionId,
      paypalOrderId: `ORD_HIST_2_${testPrefix}`,
      paypalCaptureId: `CAP_HIST_2_${testPrefix}`,
      amount: 20.00,
      currency: 'USD',
      status: 'COMPLETED',
      createdAt: new Date(Date.now() - 40000).toISOString(),
      updatedAt: new Date(Date.now() - 30000).toISOString(),
    });

    // 3. Aberrant later creation attempt: CREATED
    await paymentRepo.save({
      paymentId: `pay_hist_3_${testPrefix}`,
      decisionId,
      paypalOrderId: `ORD_HIST_3_${testPrefix}`,
      amount: 20.00,
      currency: 'USD',
      status: 'CREATED',
      createdAt: new Date(Date.now() - 10000).toISOString(),
      updatedAt: new Date(Date.now() - 5000).toISOString(),
    });

    // findByDecisionId MUST resolve to the settled COMPLETED record
    const resolved = await paymentRepo.findByDecisionId(decisionId);
    assert.ok(resolved);
    assert.equal(resolved?.paymentId, completedPaymentId);
    assert.equal(resolved?.status, 'COMPLETED');
    assert.equal(resolved?.paypalCaptureId, `CAP_HIST_2_${testPrefix}`);
  });
});

