import { SpendingPolicy } from '../types/authorization.types';

export class PolicyService {
  private currentPolicy: SpendingPolicy;

  constructor() {
    this.currentPolicy = this.getDefaultPolicy();
  }

  public getDefaultPolicy(): SpendingPolicy {
    return {
      id: 'policy_global_default',
      version: '1.0.0',
      autoApprovalMaxAmount: 100, // <= $100: can be auto-approved
      reviewThresholdMaxAmount: 500, // > $100 & <= $500: requires review; > $500: requires explicit approval
      supportedCurrencies: ['USD', 'EUR', 'GBP', 'CAD', 'AUD'],
      blockedCategories: [
        'crypto',
        'cryptocurrency',
        'digital currency',
        'gift cards',
        'gift card',
        'vouchers',
        'voucher exchange',
        'gambling',
      ],
      restrictedDomainTlds: ['.xyz', '.top', '.biz', '.click', '.loan', '.country', '.win'],
      enforceUserBudget: true,
      updatedAt: new Date().toISOString(),
    };
  }

  public getPolicy(): SpendingPolicy {
    return { ...this.currentPolicy };
  }

  public validatePolicyUpdate(updates: Partial<SpendingPolicy>): string | null {
    if (updates.autoApprovalMaxAmount !== undefined) {
      if (
        typeof updates.autoApprovalMaxAmount !== 'number' ||
        isNaN(updates.autoApprovalMaxAmount) ||
        !isFinite(updates.autoApprovalMaxAmount) ||
        updates.autoApprovalMaxAmount <= 0
      ) {
        return 'autoApprovalMaxAmount must be a positive finite number greater than 0.';
      }
    }

    if (updates.reviewThresholdMaxAmount !== undefined) {
      if (
        typeof updates.reviewThresholdMaxAmount !== 'number' ||
        isNaN(updates.reviewThresholdMaxAmount) ||
        !isFinite(updates.reviewThresholdMaxAmount) ||
        updates.reviewThresholdMaxAmount <= 0
      ) {
        return 'reviewThresholdMaxAmount must be a positive finite number greater than 0.';
      }
    }

    const effectiveAuto = updates.autoApprovalMaxAmount ?? this.currentPolicy.autoApprovalMaxAmount;
    const effectiveReview = updates.reviewThresholdMaxAmount ?? this.currentPolicy.reviewThresholdMaxAmount;

    if (effectiveAuto > effectiveReview) {
      return `autoApprovalMaxAmount ($${effectiveAuto}) cannot exceed reviewThresholdMaxAmount ($${effectiveReview}).`;
    }

    if (updates.supportedCurrencies !== undefined) {
      if (!Array.isArray(updates.supportedCurrencies) || updates.supportedCurrencies.length === 0) {
        return 'supportedCurrencies must be a non-empty array of uppercase currency codes.';
      }
      for (const curr of updates.supportedCurrencies) {
        if (typeof curr !== 'string' || curr.trim().length < 3 || curr.trim().length > 5) {
          return `Invalid currency code: "${curr}". Must be a 3-5 character currency string.`;
        }
      }
    }

    if (updates.blockedCategories !== undefined && !Array.isArray(updates.blockedCategories)) {
      return 'blockedCategories must be an array of category strings.';
    }

    if (updates.restrictedDomainTlds !== undefined && !Array.isArray(updates.restrictedDomainTlds)) {
      return 'restrictedDomainTlds must be an array of domain extension strings.';
    }

    return null;
  }

  public updatePolicy(updates: Partial<SpendingPolicy>): SpendingPolicy {
    const error = this.validatePolicyUpdate(updates);
    if (error) {
      throw new Error(`Policy validation error: ${error}`);
    }

    const sanitizedCurrencies = updates.supportedCurrencies
      ? updates.supportedCurrencies.map((c) => c.trim().toUpperCase())
      : this.currentPolicy.supportedCurrencies;

    this.currentPolicy = {
      ...this.currentPolicy,
      ...updates,
      supportedCurrencies: sanitizedCurrencies,
      updatedAt: new Date().toISOString(),
    };

    return this.getPolicy();
  }

  public resetPolicy(): SpendingPolicy {
    this.currentPolicy = this.getDefaultPolicy();
    return this.getPolicy();
  }
}

export const policyService = new PolicyService();
