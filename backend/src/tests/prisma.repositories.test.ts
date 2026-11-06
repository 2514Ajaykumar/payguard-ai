import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PrismaClient, Prisma } from '@prisma/client';
import { PrismaDecisionRepository } from '../repositories/prisma.decision.repository';
import { PrismaPaymentRepository } from '../repositories/prisma.payment.repository';
import {
  createDecisionRepository,
  createPaymentRepository,
  createRepositories,
} from '../repositories/factory';
import { InMemoryDecisionRepository } from '../repositories/decision.repository';
import { InMemoryPaymentRepository } from '../repositories/payment.repository';
import { AuthorizationDecision } from '../types/authorization.types';
import { PaymentRecord } from '../types/payment.types';

describe('Phase 5.1B: Prisma PostgreSQL Repositories Tests', () => {
  describe('1. Repository Factory & Storage Driver Selection', () => {
    it('creates PrismaDecisionRepository when driver is "postgres"', () => {
      const repo = createDecisionRepository('postgres');
      assert.ok(repo instanceof PrismaDecisionRepository);
    });

    it('creates InMemoryDecisionRepository when driver is "in_memory"', () => {
      const repo = createDecisionRepository('in_memory');
      assert.ok(repo instanceof InMemoryDecisionRepository);
    });

    it('creates PrismaPaymentRepository when driver is "postgres"', () => {
      const repo = createPaymentRepository('postgres');
      assert.ok(repo instanceof PrismaPaymentRepository);
    });

    it('creates InMemoryPaymentRepository when driver is "in_memory"', () => {
      const repo = createPaymentRepository('in_memory');
      assert.ok(repo instanceof InMemoryPaymentRepository);
    });

    it('creates full bundle matching the specified driver', () => {
      const pgBundle = createRepositories('postgres');
      assert.equal(pgBundle.driver, 'postgres');
      assert.ok(pgBundle.decisionRepository instanceof PrismaDecisionRepository);
      assert.ok(pgBundle.paymentRepository instanceof PrismaPaymentRepository);

      const memBundle = createRepositories('in_memory');
      assert.equal(memBundle.driver, 'in_memory');
      assert.ok(memBundle.decisionRepository instanceof InMemoryDecisionRepository);
      assert.ok(memBundle.paymentRepository instanceof InMemoryPaymentRepository);
    });
  });

  describe('2. PrismaDecisionRepository Domain Mapping & Logic', () => {
    it('correctly maps domain AuthorizationDecision to Prisma create input and maps result back to domain', async () => {
      let capturedCreateArgs: any = null;

      const mockPrisma = {
        authorizationDecision: {
          create: async (args: any) => {
            capturedCreateArgs = args;
            // Simulate Prisma returning stored record with Decimal amount and Date objects
            return {
              decisionId: args.data.decisionId,
              status: args.data.status,
              canProceedToPayment: args.data.canProceedToPayment,
              intentId: args.data.intentId,
              agentId: args.data.agentId,
              merchantName: args.data.merchantName,
              merchantDomain: args.data.merchantDomain,
              category: args.data.category,
              amount: new Prisma.Decimal('45.00'),
              currency: args.data.currency,
              description: args.data.description,
              userBudgetLimit: new Prisma.Decimal('200.00'),
              intentMetadata: args.data.intentMetadata,
              policyVersion: args.data.policyVersion,
              reasonCodes: args.data.reasonCodes,
              explanation: args.data.explanation,
              policyChecks: args.data.policyChecks,
              riskScore: null,
              reviewedBy: args.data.reviewedBy,
              reviewedAt: args.data.reviewedAt,
              reviewDecision: args.data.reviewDecision,
              reviewNotes: args.data.reviewNotes,
              evaluatedAt: args.data.evaluatedAt,
              createdAt: new Date(),
              updatedAt: new Date(),
            };
          },
        },
      } as unknown as PrismaClient;

      const repo = new PrismaDecisionRepository(mockPrisma);

      const testDecision: AuthorizationDecision = {
        decisionId: 'auth_dec_test_001',
        status: 'APPROVED',
        canProceedToPayment: true,
        purchaseIntent: {
          id: 'intent_123',
          agentId: 'agent-devops-01',
          merchantName: 'GitHub Inc.',
          merchantDomain: 'github.com',
          category: 'Developer Tools',
          amount: 45.00,
          currency: 'USD',
          description: 'GitHub Copilot renewal',
          userBudgetLimit: 200.00,
          metadata: { env: 'production' },
        },
        evaluatedAt: '2026-11-04T12:00:00.000Z',
        policyVersion: '1.0.0',
        reasonCodes: ['AUTO_APPROVAL_THRESHOLD_SATISFIED'],
        explanation: 'Spend is within $100 auto-approval threshold.',
        policyChecks: [
          { checkName: 'AMOUNT_VALIDATION', status: 'PASSED', message: 'Valid amount' },
        ],
        reviewMetadata: {
          reviewedBy: 'supervisor_bob',
          reviewedAt: '2026-11-04T12:05:00.000Z',
          reviewDecision: 'MANUALLY_APPROVED',
          reviewNotes: 'Approved for dev infrastructure',
        },
      };

      const result = await repo.save(testDecision);

      // Verify create args passed to Prisma
      assert.equal(capturedCreateArgs.data.decisionId, 'auth_dec_test_001');
      assert.equal(capturedCreateArgs.data.status, 'APPROVED');
      assert.equal(capturedCreateArgs.data.canProceedToPayment, true);
      assert.ok(capturedCreateArgs.data.amount instanceof Prisma.Decimal);
      assert.equal(capturedCreateArgs.data.amount.toString(), '45');
      assert.ok(capturedCreateArgs.data.userBudgetLimit instanceof Prisma.Decimal);
      assert.equal(capturedCreateArgs.data.userBudgetLimit.toString(), '200');
      assert.equal(capturedCreateArgs.data.reviewedBy, 'supervisor_bob');

      // Verify returned domain model mapping
      assert.equal(result.decisionId, 'auth_dec_test_001');
      assert.equal(typeof result.purchaseIntent.amount, 'number');
      assert.equal(result.purchaseIntent.amount, 45.00);
      assert.equal(result.purchaseIntent.userBudgetLimit, 200.00);
      assert.equal(result.purchaseIntent.currency, 'USD');
      assert.equal(result.status, 'APPROVED');
      assert.equal(result.canProceedToPayment, true);
      assert.equal(result.reviewMetadata?.reviewedBy, 'supervisor_bob');
      assert.equal(result.reviewMetadata?.reviewDecision, 'MANUALLY_APPROVED');
    });

    it('correctly handles findById and returns null when not found', async () => {
      const mockPrisma = {
        authorizationDecision: {
          findUnique: async ({ where }: any) => {
            if (where.decisionId === 'auth_dec_exists') {
              return {
                decisionId: 'auth_dec_exists',
                status: 'APPROVED',
                canProceedToPayment: true,
                intentId: 'intent_1',
                agentId: 'bot-1',
                merchantName: 'Stripe',
                merchantDomain: 'stripe.com',
                category: 'Payments',
                amount: new Prisma.Decimal('99.99'),
                currency: 'USD',
                description: 'API fee',
                userBudgetLimit: null,
                intentMetadata: null,
                policyVersion: '1.0.0',
                reasonCodes: ['APPROVED'],
                explanation: 'Approved',
                policyChecks: [],
                riskScore: null,
                reviewedBy: null,
                reviewedAt: null,
                reviewDecision: null,
                reviewNotes: null,
                evaluatedAt: new Date('2026-11-04T10:00:00.000Z'),
                createdAt: new Date(),
                updatedAt: new Date(),
              };
            }
            return null;
          },
        },
      } as unknown as PrismaClient;

      const repo = new PrismaDecisionRepository(mockPrisma);

      const found = await repo.findById('auth_dec_exists');
      assert.ok(found);
      assert.equal(found?.decisionId, 'auth_dec_exists');
      assert.equal(found?.purchaseIntent.amount, 99.99);
      assert.equal(found?.purchaseIntent.userBudgetLimit, undefined);
      assert.equal(found?.reviewMetadata, undefined);

      const notFound = await repo.findById('auth_dec_missing');
      assert.equal(notFound, null);
    });

    it('updates decision status and strictly maintains canProceedToPayment invariant', async () => {
      let capturedUpdateArgs: any = null;

      const mockPrisma = {
        authorizationDecision: {
          findUnique: async () => ({
            decisionId: 'auth_dec_review',
            status: 'REVIEW_REQUIRED',
            canProceedToPayment: false,
          }),
          update: async (args: any) => {
            capturedUpdateArgs = args;
            return {
              decisionId: 'auth_dec_review',
              status: args.data.status,
              canProceedToPayment: args.data.canProceedToPayment,
              intentId: null,
              agentId: 'bot-02',
              merchantName: 'AWS',
              merchantDomain: 'aws.amazon.com',
              category: 'Cloud',
              amount: new Prisma.Decimal('350.00'),
              currency: 'USD',
              description: 'EC2 reservation',
              userBudgetLimit: null,
              intentMetadata: null,
              policyVersion: '1.0.0',
              reasonCodes: ['MANUALLY_APPROVED'],
              explanation: args.data.explanation,
              policyChecks: [],
              riskScore: null,
              reviewedBy: args.data.reviewedBy,
              reviewedAt: args.data.reviewedAt,
              reviewDecision: args.data.reviewDecision,
              reviewNotes: args.data.reviewNotes,
              evaluatedAt: new Date(),
              createdAt: new Date(),
              updatedAt: new Date(),
            };
          },
        },
      } as unknown as PrismaClient;

      const repo = new PrismaDecisionRepository(mockPrisma);

      const updated = await repo.update('auth_dec_review', {
        status: 'APPROVED',
        explanation: 'Supervisor approved cloud infrastructure expense.',
        reviewMetadata: {
          reviewedBy: 'supervisor_charlie',
          reviewedAt: new Date().toISOString(),
          reviewDecision: 'MANUALLY_APPROVED',
          reviewNotes: 'Verified project ticket',
        },
      });

      assert.ok(updated);
      assert.equal(capturedUpdateArgs.data.status, 'APPROVED');
      assert.equal(capturedUpdateArgs.data.canProceedToPayment, true);
      assert.equal(updated?.canProceedToPayment, true);
      assert.equal(updated?.reviewMetadata?.reviewedBy, 'supervisor_charlie');
    });
  });

  describe('3. PrismaPaymentRepository Domain Mapping & Idempotency Precedence', () => {
    it('correctly maps domain PaymentRecord to Prisma create input and maps back', async () => {
      let capturedCreateArgs: any = null;

      const mockPrisma = {
        paymentRecord: {
          create: async (args: any) => {
            capturedCreateArgs = args;
            return {
              paymentId: args.data.paymentId,
              decisionId: 'auth_dec_001',
              paypalOrderId: args.data.paypalOrderId,
              paypalCaptureId: args.data.paypalCaptureId,
              amount: new Prisma.Decimal('45.00'),
              currency: args.data.currency,
              status: args.data.status,
              approvalUrl: args.data.approvalUrl,
              payerId: args.data.payerId,
              payerEmail: args.data.payerEmail,
              failureReason: args.data.failureReason,
              settlementMismatch: args.data.settlementMismatch,
              metadata: args.data.metadata,
              createdAt: args.data.createdAt,
              updatedAt: args.data.updatedAt,
            };
          },
        },
      } as unknown as PrismaClient;

      const repo = new PrismaPaymentRepository(mockPrisma);

      const payment: PaymentRecord = {
        paymentId: 'pay_rec_001',
        decisionId: 'auth_dec_001',
        paypalOrderId: 'ORDER_SANDBOX_12345',
        paypalCaptureId: 'CAPTURE_SANDBOX_67890',
        amount: 45.00,
        currency: 'USD',
        status: 'COMPLETED',
        approvalUrl: 'https://sandbox.paypal.com/checkout?token=12345',
        payerId: 'PAYER_999',
        payerEmail: 'payer@example.com',
        createdAt: '2026-11-04T12:00:00.000Z',
        updatedAt: '2026-11-04T12:02:00.000Z',
        metadata: { agentId: 'bot-1' },
      };

      const result = await repo.save(payment);

      assert.equal(capturedCreateArgs.data.paymentId, 'pay_rec_001');
      assert.equal(capturedCreateArgs.data.decision.connect.decisionId, 'auth_dec_001');
      assert.ok(capturedCreateArgs.data.amount instanceof Prisma.Decimal);
      assert.equal(capturedCreateArgs.data.amount.toString(), '45');
      assert.equal(result.paymentId, 'pay_rec_001');
      assert.equal(result.amount, 45.00);
      assert.equal(typeof result.amount, 'number');
      assert.equal(result.status, 'COMPLETED');
    });

    it('findByDecisionId enforces settled record precedence (COMPLETED over newer active/failed records)', async () => {
      // Simulate historical attempts:
      // Record 1 (oldest): CANCELLED
      // Record 2 (middle): COMPLETED
      // Record 3 (newest): CREATED (e.g. simulated aberrant attempt)
      const mockRecords = [
        {
          paymentId: 'pay_3_aberrant_created',
          decisionId: 'auth_dec_test',
          paypalOrderId: 'ORDER_3',
          paypalCaptureId: null,
          amount: new Prisma.Decimal('50.00'),
          currency: 'USD',
          status: 'CREATED',
          approvalUrl: 'url3',
          payerId: null,
          payerEmail: null,
          failureReason: null,
          settlementMismatch: null,
          metadata: null,
          createdAt: new Date('2026-11-04T12:05:00.000Z'),
          updatedAt: new Date('2026-11-04T12:05:00.000Z'),
        },
        {
          paymentId: 'pay_2_settled_completed',
          decisionId: 'auth_dec_test',
          paypalOrderId: 'ORDER_2',
          paypalCaptureId: 'CAPTURE_2',
          amount: new Prisma.Decimal('50.00'),
          currency: 'USD',
          status: 'COMPLETED',
          approvalUrl: 'url2',
          payerId: 'PAYER_2',
          payerEmail: 'p2@example.com',
          failureReason: null,
          settlementMismatch: null,
          metadata: null,
          createdAt: new Date('2026-11-04T12:02:00.000Z'),
          updatedAt: new Date('2026-11-04T12:03:00.000Z'),
        },
        {
          paymentId: 'pay_1_cancelled',
          decisionId: 'auth_dec_test',
          paypalOrderId: 'ORDER_1',
          paypalCaptureId: null,
          amount: new Prisma.Decimal('50.00'),
          currency: 'USD',
          status: 'CANCELLED',
          approvalUrl: 'url1',
          payerId: null,
          payerEmail: null,
          failureReason: 'Buyer cancelled',
          settlementMismatch: null,
          metadata: null,
          createdAt: new Date('2026-11-04T12:00:00.000Z'),
          updatedAt: new Date('2026-11-04T12:01:00.000Z'),
        },
      ];

      const mockPrisma = {
        paymentRecord: {
          findMany: async () => mockRecords,
        },
      } as unknown as PrismaClient;

      const repo = new PrismaPaymentRepository(mockPrisma);

      const resolved = await repo.findByDecisionId('auth_dec_test');
      assert.ok(resolved);
      // Precedence Rule 1: Settled COMPLETED record must be returned to preserve absolute idempotency!
      assert.equal(resolved?.paymentId, 'pay_2_settled_completed');
      assert.equal(resolved?.status, 'COMPLETED');
      assert.equal(resolved?.paypalCaptureId, 'CAPTURE_2');
    });

    it('findByDecisionId prefers active CREATED record over older CANCELLED/FAILED records', async () => {
      const mockRecords = [
        {
          paymentId: 'pay_retry_active',
          decisionId: 'auth_dec_retry',
          paypalOrderId: 'ORDER_ACTIVE',
          paypalCaptureId: null,
          amount: new Prisma.Decimal('75.00'),
          currency: 'USD',
          status: 'CREATED',
          approvalUrl: 'url_active',
          payerId: null,
          payerEmail: null,
          failureReason: null,
          settlementMismatch: null,
          metadata: null,
          createdAt: new Date('2026-11-04T14:10:00.000Z'),
          updatedAt: new Date('2026-11-04T14:10:00.000Z'),
        },
        {
          paymentId: 'pay_first_cancelled',
          decisionId: 'auth_dec_retry',
          paypalOrderId: 'ORDER_CANCELLED',
          paypalCaptureId: null,
          amount: new Prisma.Decimal('75.00'),
          currency: 'USD',
          status: 'CANCELLED',
          approvalUrl: 'url_cancel',
          payerId: null,
          payerEmail: null,
          failureReason: 'Buyer closed browser',
          settlementMismatch: null,
          metadata: null,
          createdAt: new Date('2026-11-04T14:00:00.000Z'),
          updatedAt: new Date('2026-11-04T14:05:00.000Z'),
        },
      ];

      const mockPrisma = {
        paymentRecord: {
          findMany: async () => mockRecords,
        },
      } as unknown as PrismaClient;

      const repo = new PrismaPaymentRepository(mockPrisma);

      const resolved = await repo.findByDecisionId('auth_dec_retry');
      assert.ok(resolved);
      assert.equal(resolved?.paymentId, 'pay_retry_active');
      assert.equal(resolved?.status, 'CREATED');
    });

    it('preserves settlement mismatch details on RECONCILIATION_REQUIRED updates', async () => {
      let capturedUpdate: any = null;

      const mockPrisma = {
        paymentRecord: {
          findUnique: async () => ({
            paymentId: 'pay_recon_01',
            status: 'CREATED',
          }),
          update: async (args: any) => {
            capturedUpdate = args;
            return {
              paymentId: 'pay_recon_01',
              decisionId: 'auth_dec_01',
              paypalOrderId: 'ORD_RECON',
              paypalCaptureId: args.data.paypalCaptureId,
              amount: new Prisma.Decimal('50.00'),
              currency: 'USD',
              status: args.data.status,
              approvalUrl: 'url',
              payerId: 'PAYER_RECON',
              payerEmail: 'recon@example.com',
              failureReason: args.data.failureReason,
              settlementMismatch: args.data.settlementMismatch,
              metadata: null,
              createdAt: new Date(),
              updatedAt: new Date(),
            };
          },
        },
      } as unknown as PrismaClient;

      const repo = new PrismaPaymentRepository(mockPrisma);

      const updated = await repo.update('pay_recon_01', {
        status: 'RECONCILIATION_REQUIRED',
        paypalCaptureId: 'CAP_MISMATCH_99',
        failureReason: 'Settlement amount mismatch detected',
        settlementMismatch: {
          expectedAmount: 50.00,
          expectedCurrency: 'USD',
          capturedAmount: 40.00,
          capturedCurrency: 'USD',
          reason: 'Amount mismatch (expected $50.00, captured $40.00)',
        },
      });

      assert.ok(updated);
      assert.equal(updated?.status, 'RECONCILIATION_REQUIRED');
      assert.equal(updated?.settlementMismatch?.capturedAmount, 40.00);
      assert.equal(capturedUpdate.data.status, 'RECONCILIATION_REQUIRED');
    });
  });
});

