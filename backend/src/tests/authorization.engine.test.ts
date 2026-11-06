import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AuthorizationService } from '../services/authorization.service';
import { PolicyService } from '../services/policy.service';
import { InMemoryDecisionRepository } from '../repositories/decision.repository';

describe('PayGuard Authorization Engine Tests', () => {
  const createTestRig = () => {
    const policySvc = new PolicyService();
    const repo = new InMemoryDecisionRepository();
    const authSvc = new AuthorizationService(policySvc, repo);
    return { policySvc, repo, authSvc };
  };

  describe('1. Auto-Approval Tier (<= $100)', () => {
    it('approves a purchase of $50 when all checks pass', async () => {
      const { authSvc } = createTestRig();
      const decision = await authSvc.evaluatePurchaseIntent({
        agentId: 'agent-devops-01',
        merchantName: 'GitHub Inc.',
        merchantDomain: 'github.com',
        amount: 50.00,
        currency: 'USD',
        category: 'Developer Tools',
      });

      assert.equal(decision.status, 'APPROVED');
      assert.equal(decision.canProceedToPayment, true);
      assert.ok(decision.reasonCodes.includes('AUTO_APPROVAL_THRESHOLD_SATISFIED'));
      assert.ok(decision.decisionId.startsWith('auth_dec_'));
      assert.ok(decision.evaluatedAt);
    });

    it('approves a purchase at the exact $100.00 boundary', async () => {
      const { authSvc } = createTestRig();
      const decision = await authSvc.evaluatePurchaseIntent({
        agentId: 'agent-devops-01',
        merchantName: 'Linear App',
        amount: 100.00,
        currency: 'USD',
      });

      assert.equal(decision.status, 'APPROVED');
      assert.equal(decision.canProceedToPayment, true);
    });
  });

  describe('2. Review Required Tier ($100 to $500)', () => {
    it('requires review for a purchase of $100.01', async () => {
      const { authSvc } = createTestRig();
      const decision = await authSvc.evaluatePurchaseIntent({
        agentId: 'agent-marketing-01',
        merchantName: 'Canva Pro',
        amount: 100.01,
        currency: 'USD',
      });

      assert.equal(decision.status, 'REVIEW_REQUIRED');
      assert.equal(decision.canProceedToPayment, false);
      assert.ok(decision.reasonCodes.includes('AMOUNT_REQUIRES_REVIEW'));
    });

    it('requires review for a purchase of $500.00', async () => {
      const { authSvc } = createTestRig();
      const decision = await authSvc.evaluatePurchaseIntent({
        agentId: 'agent-marketing-01',
        merchantName: 'Figma Team',
        amount: 500.00,
        currency: 'USD',
      });

      assert.equal(decision.status, 'REVIEW_REQUIRED');
      assert.equal(decision.canProceedToPayment, false);
      assert.ok(decision.reasonCodes.includes('AMOUNT_REQUIRES_REVIEW'));
    });
  });

  describe('3. High-Value Explicit Approval Tier (> $500)', () => {
    it('requires explicit approval for a purchase of $500.01', async () => {
      const { authSvc } = createTestRig();
      const decision = await authSvc.evaluatePurchaseIntent({
        agentId: 'agent-procurement-01',
        merchantName: 'AWS Cloud Services',
        amount: 500.01,
        currency: 'USD',
      });

      assert.equal(decision.status, 'REVIEW_REQUIRED');
      assert.equal(decision.canProceedToPayment, false);
      assert.ok(decision.reasonCodes.includes('EXPLICIT_APPROVAL_REQUIRED'));
    });

    it('requires explicit approval for a purchase of $2,500.00', async () => {
      const { authSvc } = createTestRig();
      const decision = await authSvc.evaluatePurchaseIntent({
        agentId: 'agent-procurement-01',
        merchantName: 'Lambda GPU Cloud',
        amount: 2500.00,
        currency: 'USD',
      });

      assert.equal(decision.status, 'REVIEW_REQUIRED');
      assert.equal(decision.canProceedToPayment, false);
      assert.ok(decision.reasonCodes.includes('EXPLICIT_APPROVAL_REQUIRED'));
    });
  });

  describe('4. User Budget Limit Enforcement', () => {
    it('does NOT automatically approve when amount exceeds stated user budget even if amount <= $100', async () => {
      const { authSvc } = createTestRig();
      const decision = await authSvc.evaluatePurchaseIntent({
        agentId: 'agent-devops-01',
        merchantName: 'Small SaaS Tool',
        amount: 60.00,
        currency: 'USD',
        userBudgetLimit: 40.00, // Budget is $40, requested is $60
      });

      assert.notEqual(decision.status, 'APPROVED');
      assert.equal(decision.status, 'REVIEW_REQUIRED');
      assert.equal(decision.canProceedToPayment, false);
      assert.ok(decision.reasonCodes.includes('EXCEEDS_USER_BUDGET'));
    });

    it('approves when amount is within user budget and <= $100', async () => {
      const { authSvc } = createTestRig();
      const decision = await authSvc.evaluatePurchaseIntent({
        agentId: 'agent-devops-01',
        merchantName: 'Small SaaS Tool',
        amount: 60.00,
        currency: 'USD',
        userBudgetLimit: 100.00, // Budget is $100, requested is $60
      });

      assert.equal(decision.status, 'APPROVED');
      assert.equal(decision.canProceedToPayment, true);
    });

    it('blocks request when user budget limit is negative', async () => {
      const { authSvc } = createTestRig();
      const decision = await authSvc.evaluatePurchaseIntent({
        agentId: 'agent-devops-01',
        merchantName: 'Small SaaS Tool',
        amount: 60.00,
        currency: 'USD',
        userBudgetLimit: -10.00,
      });

      assert.equal(decision.status, 'BLOCKED');
      assert.equal(decision.canProceedToPayment, false);
      assert.ok(decision.reasonCodes.includes('INVALID_USER_BUDGET'));
    });
  });

  describe('5. Invalid Amounts & Edge Cases', () => {
    it('safely rejects negative amount', async () => {
      const { authSvc } = createTestRig();
      const decision = await authSvc.evaluatePurchaseIntent({
        agentId: 'agent-devops-01',
        merchantName: 'Vendor',
        amount: -50.00,
        currency: 'USD',
      });

      assert.equal(decision.status, 'BLOCKED');
      assert.equal(decision.canProceedToPayment, false);
      assert.ok(decision.reasonCodes.includes('INVALID_AMOUNT'));
    });

    it('safely rejects zero amount', async () => {
      const { authSvc } = createTestRig();
      const decision = await authSvc.evaluatePurchaseIntent({
        agentId: 'agent-devops-01',
        merchantName: 'Vendor',
        amount: 0,
        currency: 'USD',
      });

      assert.equal(decision.status, 'BLOCKED');
      assert.equal(decision.canProceedToPayment, false);
      assert.ok(decision.reasonCodes.includes('INVALID_AMOUNT'));
    });

    it('safely rejects NaN or Infinity', async () => {
      const { authSvc } = createTestRig();
      const decision = await authSvc.evaluatePurchaseIntent({
        agentId: 'agent-devops-01',
        merchantName: 'Vendor',
        amount: Infinity,
        currency: 'USD',
      });

      assert.equal(decision.status, 'BLOCKED');
      assert.equal(decision.canProceedToPayment, false);
      assert.ok(decision.reasonCodes.includes('INVALID_AMOUNT'));
    });

    it('safely rejects non-numeric amount', async () => {
      const { authSvc } = createTestRig();
      const decision = await authSvc.evaluatePurchaseIntent({
        agentId: 'agent-devops-01',
        merchantName: 'Vendor',
        amount: 'fifty' as unknown as number,
        currency: 'USD',
      });

      assert.equal(decision.status, 'BLOCKED');
      assert.equal(decision.canProceedToPayment, false);
      assert.ok(decision.reasonCodes.includes('INVALID_AMOUNT'));
    });
  });

  describe('6. Unsupported Currencies & Missing Identity', () => {
    it('safely rejects unsupported currency code', async () => {
      const { authSvc } = createTestRig();
      const decision = await authSvc.evaluatePurchaseIntent({
        agentId: 'agent-devops-01',
        merchantName: 'Vendor',
        amount: 50.00,
        currency: 'XYZ',
      });

      assert.equal(decision.status, 'BLOCKED');
      assert.equal(decision.canProceedToPayment, false);
      assert.ok(decision.reasonCodes.includes('UNSUPPORTED_CURRENCY'));
    });

    it('safely rejects missing agent ID', async () => {
      const { authSvc } = createTestRig();
      const decision = await authSvc.evaluatePurchaseIntent({
        agentId: '',
        merchantName: 'Vendor',
        amount: 50.00,
        currency: 'USD',
      });

      assert.equal(decision.status, 'BLOCKED');
      assert.ok(decision.reasonCodes.includes('INVALID_AGENT_ID'));
    });

    it('safely rejects missing merchant name', async () => {
      const { authSvc } = createTestRig();
      const decision = await authSvc.evaluatePurchaseIntent({
        agentId: 'agent-devops-01',
        merchantName: '',
        amount: 50.00,
        currency: 'USD',
      });

      assert.equal(decision.status, 'BLOCKED');
      assert.ok(decision.reasonCodes.includes('INVALID_MERCHANT_NAME'));
    });
  });

  describe('7. Malformed Requests', () => {
    it('safely handles null or non-object payloads', async () => {
      const { authSvc } = createTestRig();
      const decisionNull = await authSvc.evaluatePurchaseIntent(null);
      assert.equal(decisionNull.status, 'BLOCKED');
      assert.equal(decisionNull.canProceedToPayment, false);

      const decisionStr = await authSvc.evaluatePurchaseIntent('not a json object');
      assert.equal(decisionStr.status, 'BLOCKED');
      assert.equal(decisionStr.canProceedToPayment, false);
    });
  });

  describe('8. Prohibited Categories & Domains', () => {
    it('blocks crypto voucher checkout attempts', async () => {
      const { authSvc } = createTestRig();
      const decision = await authSvc.evaluatePurchaseIntent({
        agentId: 'agent-01',
        merchantName: 'FastPay Crypto Exchange',
        amount: 50.00,
        currency: 'USD',
        category: 'Digital Currency & Crypto Vouchers',
      });

      assert.equal(decision.status, 'BLOCKED');
      assert.equal(decision.canProceedToPayment, false);
      assert.ok(decision.reasonCodes.includes('PROHIBITED_CATEGORY'));
    });

    it('blocks untrusted top-level domain (.xyz)', async () => {
      const { authSvc } = createTestRig();
      const decision = await authSvc.evaluatePurchaseIntent({
        agentId: 'agent-01',
        merchantName: 'Unknown Store',
        merchantDomain: 'instant-cards.xyz',
        amount: 50.00,
        currency: 'USD',
      });

      assert.equal(decision.status, 'BLOCKED');
      assert.equal(decision.canProceedToPayment, false);
      assert.ok(decision.reasonCodes.includes('RESTRICTED_DOMAIN_TLD'));
    });
  });

  describe('9. Strict Security Invariant: canProceedToPayment', () => {
    it('guarantees canProceedToPayment is strictly FALSE for BLOCKED and REVIEW_REQUIRED', async () => {
      const { authSvc } = createTestRig();
      const blockedDec = await authSvc.evaluatePurchaseIntent({
        agentId: 'agent-01',
        merchantName: 'Vendor',
        amount: -5,
        currency: 'USD',
      });
      assert.equal(blockedDec.status, 'BLOCKED');
      assert.equal(blockedDec.canProceedToPayment, false);

      const reviewDec = await authSvc.evaluatePurchaseIntent({
        agentId: 'agent-01',
        merchantName: 'Vendor',
        amount: 250,
        currency: 'USD',
      });
      assert.equal(reviewDec.status, 'REVIEW_REQUIRED');
      assert.equal(reviewDec.canProceedToPayment, false);
    });
  });

  describe('10. Auditable Review Workflow', () => {
    it('allows a human reviewer to approve a review-required decision', async () => {
      const { authSvc } = createTestRig();
      const initial = await authSvc.evaluatePurchaseIntent({
        agentId: 'agent-01',
        merchantName: 'Cloud Server Hosting',
        amount: 250.00,
        currency: 'USD',
      });

      assert.equal(initial.status, 'REVIEW_REQUIRED');
      assert.equal(initial.canProceedToPayment, false);

      const reviewed = await authSvc.reviewDecision(
        initial.decisionId,
        'APPROVE',
        'supervisor_alice',
        'Budget approved for Q4 project'
      );

      assert.equal(reviewed.status, 'APPROVED');
      assert.equal(reviewed.canProceedToPayment, true);
      assert.equal(reviewed.reviewMetadata?.reviewedBy, 'supervisor_alice');
      assert.equal(reviewed.reviewMetadata?.reviewDecision, 'MANUALLY_APPROVED');
    });

    it('prevents approving an originally BLOCKED decision', async () => {
      const { authSvc } = createTestRig();
      const blocked = await authSvc.evaluatePurchaseIntent({
        agentId: 'agent-01',
        merchantName: 'Crypto Shop',
        amount: 50.00,
        currency: 'USD',
        category: 'crypto',
      });

      assert.equal(blocked.status, 'BLOCKED');

      await assert.rejects(
        async () => {
          await authSvc.reviewDecision(blocked.decisionId, 'APPROVE', 'supervisor');
        },
        /Cannot review a decision that was permanently BLOCKED/
      );
    });
  });
});
