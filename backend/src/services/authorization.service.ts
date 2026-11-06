import { randomUUID } from 'crypto';
import {
  AuthorizationDecision,
  DecisionStatus,
  PolicyCheckResult,
  PurchaseIntent,
  ReviewMetadata,
} from '../types/authorization.types';
import { policyService, PolicyService } from './policy.service';
import { IAuthorizationDecisionRepository } from '../repositories/decision.repository';
import { decisionRepository } from '../repositories/factory';

export class AuthorizationService {
  constructor(
    private readonly policySvc: PolicyService = policyService,
    private readonly repository: IAuthorizationDecisionRepository = decisionRepository
  ) {}

  public async evaluatePurchaseIntent(rawIntent: unknown): Promise<AuthorizationDecision> {
    const evaluatedAt = new Date().toISOString();
    const policy = this.policySvc.getPolicy();
    const policyChecks: PolicyCheckResult[] = [];
    const reasonCodes: string[] = [];
    let status: DecisionStatus = 'APPROVED';

    // 1. Structural / Malformed Request Check
    if (!rawIntent || typeof rawIntent !== 'object' || Array.isArray(rawIntent)) {
      const decision: AuthorizationDecision = {
        decisionId: `auth_dec_${randomUUID().replace(/-/g, '').slice(0, 12)}`,
        status: 'BLOCKED',
        canProceedToPayment: false,
        purchaseIntent: {
          agentId: 'unknown',
          merchantName: 'unknown',
          amount: 0,
          currency: 'UNKNOWN',
        },
        evaluatedAt,
        policyVersion: policy.version,
        reasonCodes: ['MALFORMED_REQUEST_PAYLOAD'],
        explanation: 'Request body must be a valid JSON object representing a purchase intent.',
        policyChecks: [
          {
            checkName: 'REQUEST_STRUCTURE',
            status: 'FAILED',
            message: 'Malformed request payload received.',
          },
        ],
      };
      await this.repository.save(decision);
      return decision;
    }

    const intent = rawIntent as Partial<PurchaseIntent>;

    // 2. Agent & Merchant Identity Validation
    const agentId = typeof intent.agentId === 'string' && intent.agentId.trim() ? intent.agentId.trim() : '';
    const merchantName = typeof intent.merchantName === 'string' && intent.merchantName.trim() ? intent.merchantName.trim() : '';

    if (!agentId) {
      status = 'BLOCKED';
      reasonCodes.push('INVALID_AGENT_ID');
      policyChecks.push({
        checkName: 'AGENT_IDENTITY',
        status: 'FAILED',
        message: 'Agent ID is missing or empty.',
      });
    } else {
      policyChecks.push({
        checkName: 'AGENT_IDENTITY',
        status: 'PASSED',
        message: `Agent identity verified: "${agentId}".`,
      });
    }

    if (!merchantName) {
      status = 'BLOCKED';
      reasonCodes.push('INVALID_MERCHANT_NAME');
      policyChecks.push({
        checkName: 'MERCHANT_IDENTITY',
        status: 'FAILED',
        message: 'Merchant name is missing or empty.',
      });
    } else {
      policyChecks.push({
        checkName: 'MERCHANT_IDENTITY',
        status: 'PASSED',
        message: `Merchant specified: "${merchantName}".`,
      });
    }

    // 3. Amount Validation (Safely reject missing, non-numeric, zero, negative, NaN, Infinity)
    const rawAmount = intent.amount;
    const isAmountValid =
      typeof rawAmount === 'number' &&
      !isNaN(rawAmount) &&
      isFinite(rawAmount) &&
      rawAmount > 0;

    const sanitizedAmount = isAmountValid ? Math.round(rawAmount * 100) / 100 : (typeof rawAmount === 'number' ? rawAmount : 0);

    if (!isAmountValid) {
      status = 'BLOCKED';
      reasonCodes.push('INVALID_AMOUNT');
      policyChecks.push({
        checkName: 'AMOUNT_VALIDATION',
        status: 'FAILED',
        message: `Amount must be a positive, finite number. Received: ${String(rawAmount)}.`,
        details: { rawAmount },
      });
    } else {
      policyChecks.push({
        checkName: 'AMOUNT_VALIDATION',
        status: 'PASSED',
        message: `Amount $${sanitizedAmount.toFixed(2)} is valid and finite.`,
      });
    }

    // 4. Currency Validation (Supported currencies list)
    const rawCurrency = typeof intent.currency === 'string' ? intent.currency.trim().toUpperCase() : '';
    const isCurrencySupported = Boolean(rawCurrency && policy.supportedCurrencies.includes(rawCurrency));

    if (!rawCurrency || !isCurrencySupported) {
      status = 'BLOCKED';
      reasonCodes.push('UNSUPPORTED_CURRENCY');
      policyChecks.push({
        checkName: 'CURRENCY_SUPPORTED',
        status: 'FAILED',
        message: rawCurrency
          ? `Currency "${rawCurrency}" is not supported. Permitted: ${policy.supportedCurrencies.join(', ')}.`
          : 'Currency code is missing or empty.',
        details: { receivedCurrency: rawCurrency, supportedCurrencies: policy.supportedCurrencies },
      });
    } else {
      policyChecks.push({
        checkName: 'CURRENCY_SUPPORTED',
        status: 'PASSED',
        message: `Currency "${rawCurrency}" is supported.`,
      });
    }

    // 5. Merchant Category & Description Prohibited Checks
    const categoryLower = (intent.category || '').toLowerCase();
    const descLower = (intent.description || '').toLowerCase();
    const merchantLower = merchantName.toLowerCase();

    const matchedBlockedCategory = policy.blockedCategories.find(
      (cat) =>
        categoryLower.includes(cat) ||
        descLower.includes(cat) ||
        merchantLower.includes(cat)
    );

    if (matchedBlockedCategory) {
      status = 'BLOCKED';
      reasonCodes.push('PROHIBITED_CATEGORY');
      policyChecks.push({
        checkName: 'CATEGORY_COMPLIANCE',
        status: 'FAILED',
        message: `Transaction matches prohibited category or keyword: "${matchedBlockedCategory}".`,
        details: { matchedKeyword: matchedBlockedCategory },
      });
    } else {
      policyChecks.push({
        checkName: 'CATEGORY_COMPLIANCE',
        status: 'PASSED',
        message: 'No prohibited categories or restricted merchant keywords detected.',
      });
    }

    // 6. Domain Reputation & Restricted TLD Check
    const merchantDomain = typeof intent.merchantDomain === 'string' ? intent.merchantDomain.trim().toLowerCase() : '';
    if (merchantDomain) {
      const matchedTld = policy.restrictedDomainTlds.find((tld) => merchantDomain.endsWith(tld));
      if (matchedTld) {
        status = 'BLOCKED';
        reasonCodes.push('RESTRICTED_DOMAIN_TLD');
        policyChecks.push({
          checkName: 'DOMAIN_REPUTATION',
          status: 'FAILED',
          message: `Merchant domain "${merchantDomain}" uses high-risk untrusted top-level domain "${matchedTld}".`,
          details: { merchantDomain, matchedTld },
        });
      } else {
        policyChecks.push({
          checkName: 'DOMAIN_REPUTATION',
          status: 'PASSED',
          message: `Merchant domain "${merchantDomain}" passed basic reputation checks.`,
        });
      }
    }

    // 7. User Stated Budget Cap Validation
    // "Requests exceeding an explicitly stated user budget must not be automatically approved."
    if (policy.enforceUserBudget && intent.userBudgetLimit !== undefined && intent.userBudgetLimit !== null) {
      const budgetLimit = intent.userBudgetLimit;
      if (typeof budgetLimit !== 'number' || isNaN(budgetLimit) || !isFinite(budgetLimit) || budgetLimit < 0) {
        status = 'BLOCKED';
        reasonCodes.push('INVALID_USER_BUDGET');
        policyChecks.push({
          checkName: 'USER_BUDGET_CAP',
          status: 'FAILED',
          message: `Stated user budget limit must be a positive number. Received: ${String(budgetLimit)}.`,
        });
      } else if (isAmountValid && sanitizedAmount > budgetLimit) {
        // Must not be automatically approved
        if (status !== 'BLOCKED') {
          status = 'REVIEW_REQUIRED';
        }
        reasonCodes.push('EXCEEDS_USER_BUDGET');
        policyChecks.push({
          checkName: 'USER_BUDGET_CAP',
          status: 'WARNING',
          message: `Amount ($${sanitizedAmount.toFixed(2)}) exceeds stated user budget limit ($${budgetLimit.toFixed(2)}).`,
          details: { requestedAmount: sanitizedAmount, budgetLimit },
        });
      } else {
        policyChecks.push({
          checkName: 'USER_BUDGET_CAP',
          status: 'PASSED',
          message: `Amount ($${sanitizedAmount.toFixed(2)}) is within user budget limit ($${budgetLimit.toFixed(2)}).`,
        });
      }
    }

    // 8. Amount Boundary Evaluation (Only applies if not already BLOCKED by mandatory policy violation)
    if (status !== 'BLOCKED' && isAmountValid) {
      if (sanitizedAmount <= policy.autoApprovalMaxAmount) {
        // Purchases up to $100 can be approved automatically when all other checks pass.
        // (Unless budget violation already set it to REVIEW_REQUIRED)
        if (status === 'APPROVED') {
          reasonCodes.push('AUTO_APPROVAL_THRESHOLD_SATISFIED');
          policyChecks.push({
            checkName: 'SPENDING_THRESHOLD_TIER',
            status: 'PASSED',
            message: `Amount ($${sanitizedAmount.toFixed(2)}) is <= auto-approval threshold ($${policy.autoApprovalMaxAmount.toFixed(2)}).`,
          });
        }
      } else if (sanitizedAmount <= policy.reviewThresholdMaxAmount) {
        // Purchases above $100 and up to $500 require review.
        status = 'REVIEW_REQUIRED';
        reasonCodes.push('AMOUNT_REQUIRES_REVIEW');
        policyChecks.push({
          checkName: 'SPENDING_THRESHOLD_TIER',
          status: 'WARNING',
          message: `Amount ($${sanitizedAmount.toFixed(2)}) is between $${policy.autoApprovalMaxAmount.toFixed(2)} and $${policy.reviewThresholdMaxAmount.toFixed(2)}. Human review required.`,
        });
      } else {
        // Purchases above $500 require explicit approval.
        status = 'REVIEW_REQUIRED';
        reasonCodes.push('EXPLICIT_APPROVAL_REQUIRED');
        policyChecks.push({
          checkName: 'SPENDING_THRESHOLD_TIER',
          status: 'WARNING',
          message: `High-value purchase ($${sanitizedAmount.toFixed(2)}) exceeds $${policy.reviewThresholdMaxAmount.toFixed(2)}. Explicit supervisor sign-off required.`,
        });
      }
    }

    // 9. Formulate Explanation
    let explanation = '';
    if (status === 'APPROVED') {
      explanation = `Purchase of $${sanitizedAmount.toFixed(2)} ${rawCurrency} is approved. All mandatory guardrails passed and spend is within the $${policy.autoApprovalMaxAmount.toFixed(2)} auto-approval limit.`;
    } else if (status === 'REVIEW_REQUIRED') {
      const causes = reasonCodes
        .map((c) => {
          if (c === 'AMOUNT_REQUIRES_REVIEW') return `spend exceeds auto-approval cap ($${policy.autoApprovalMaxAmount})`;
          if (c === 'EXPLICIT_APPROVAL_REQUIRED') return `high-value purchase exceeds $${policy.reviewThresholdMaxAmount}`;
          if (c === 'EXCEEDS_USER_BUDGET') return `exceeds user stated budget limit`;
          return c;
        })
        .join(', ');
      explanation = `Review required before order creation: ${causes}. Order will remain suspended until authorized by an administrator.`;
    } else {
      const violations = reasonCodes
        .map((c) => {
          if (c === 'INVALID_AMOUNT') return 'invalid or non-positive amount';
          if (c === 'UNSUPPORTED_CURRENCY') return 'unsupported currency';
          if (c === 'PROHIBITED_CATEGORY') return 'prohibited merchant category';
          if (c === 'RESTRICTED_DOMAIN_TLD') return 'untrusted domain extension';
          if (c === 'INVALID_AGENT_ID') return 'missing agent ID';
          if (c === 'INVALID_MERCHANT_NAME') return 'missing merchant name';
          return c;
        })
        .join(', ');
      explanation = `Purchase blocked by PayGuard AI pre-transaction policy: ${violations}. No payment order will be initiated.`;
    }

    // 10. Construct Final Immutable Authorization Decision
    // CRITICAL SECURITY INVARIANT: canProceedToPayment is strictly (status === 'APPROVED')
    const decision: AuthorizationDecision = {
      decisionId: `auth_dec_${randomUUID().replace(/-/g, '').slice(0, 12)}`,
      status,
      canProceedToPayment: status === 'APPROVED',
      purchaseIntent: {
        id: intent.id || `intent_${randomUUID().replace(/-/g, '').slice(0, 8)}`,
        agentId: agentId || 'unknown',
        merchantName: merchantName || 'unknown',
        merchantDomain: merchantDomain || undefined,
        category: intent.category,
        amount: sanitizedAmount,
        currency: rawCurrency || 'UNKNOWN',
        description: intent.description,
        userBudgetLimit: intent.userBudgetLimit,
        metadata: intent.metadata,
      },
      evaluatedAt,
      policyVersion: policy.version,
      reasonCodes,
      explanation,
      policyChecks,
    };

    // 11. Persist in Repository for Auditing
    await this.repository.save(decision);

    return decision;
  }

  public async getDecision(decisionId: string): Promise<AuthorizationDecision | null> {
    return this.repository.findById(decisionId);
  }

  public async listDecisions(filter?: { status?: DecisionStatus; agentId?: string; limit?: number }): Promise<AuthorizationDecision[]> {
    return this.repository.list(filter);
  }

  public async reviewDecision(
    decisionId: string,
    action: 'APPROVE' | 'REJECT',
    reviewerId: string,
    notes?: string
  ): Promise<AuthorizationDecision> {
    const existing = await this.repository.findById(decisionId);
    if (!existing) {
      throw new Error(`Decision with ID "${decisionId}" not found.`);
    }

    if (existing.status === 'BLOCKED') {
      throw new Error('Cannot review a decision that was permanently BLOCKED by policy violation.');
    }

    if (existing.reviewMetadata) {
      throw new Error(`Decision has already been reviewed by "${existing.reviewMetadata.reviewedBy}".`);
    }

    const newStatus: DecisionStatus = action === 'APPROVE' ? 'APPROVED' : 'BLOCKED';
    const reviewMetadata: ReviewMetadata = {
      reviewedBy: reviewerId || 'supervisor_admin',
      reviewedAt: new Date().toISOString(),
      reviewDecision: action === 'APPROVE' ? 'MANUALLY_APPROVED' : 'MANUALLY_REJECTED',
      reviewNotes: notes,
    };

    const updatedExplanation = action === 'APPROVE'
      ? `Manually approved by supervisor ${reviewMetadata.reviewedBy}: ${notes || 'Verified legitimate expense'}. Eligible to proceed to payment.`
      : `Manually rejected by supervisor ${reviewMetadata.reviewedBy}: ${notes || 'Declined during review'}. Payment blocked.`;

    const updated = await this.repository.update(decisionId, {
      status: newStatus,
      canProceedToPayment: newStatus === 'APPROVED',
      explanation: updatedExplanation,
      reviewMetadata,
    });

    if (!updated) {
      throw new Error(`Failed to update decision "${decisionId}".`);
    }

    return updated;
  }
}

export const authorizationService = new AuthorizationService();
