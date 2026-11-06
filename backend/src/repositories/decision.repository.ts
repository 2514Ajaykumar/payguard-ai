import { AuthorizationDecision, DecisionFilter } from '../types/authorization.types';

export interface IAuthorizationDecisionRepository {
  save(decision: AuthorizationDecision): Promise<AuthorizationDecision>;
  findById(id: string): Promise<AuthorizationDecision | null>;
  list(filter?: DecisionFilter): Promise<AuthorizationDecision[]>;
  update(id: string, updates: Partial<AuthorizationDecision>): Promise<AuthorizationDecision | null>;
  count(): Promise<number>;
}

/**
 * In-Memory Auditable Authorization Decision Repository.
 * 
 * NOTE: Storage label: [TEMPORARY_IN_MEMORY_STORE]
 * This implementation provides ephemeral audit storage during Phase 2.
 * PostgreSQL database integration is provided via PrismaDecisionRepository.
 */
export class InMemoryDecisionRepository implements IAuthorizationDecisionRepository {
  private readonly storage: Map<string, AuthorizationDecision> = new Map();

  constructor() {
    this.seedInitialAudits();
  }

  public async save(decision: AuthorizationDecision): Promise<AuthorizationDecision> {
    // Clone to ensure immutability
    const record = JSON.parse(JSON.stringify(decision));
    this.storage.set(decision.decisionId, record);
    return record;
  }

  public async findById(id: string): Promise<AuthorizationDecision | null> {
    const record = this.storage.get(id);
    return record ? JSON.parse(JSON.stringify(record)) : null;
  }

  public async list(filter?: DecisionFilter): Promise<AuthorizationDecision[]> {
    let results = Array.from(this.storage.values());

    if (filter?.status) {
      results = results.filter((d) => d.status === filter.status);
    }

    if (filter?.agentId) {
      results = results.filter((d) => d.purchaseIntent.agentId === filter.agentId);
    }

    // Sort descending by evaluation timestamp
    results.sort((a, b) => new Date(b.evaluatedAt).getTime() - new Date(a.evaluatedAt).getTime());

    if (filter?.limit && filter.limit > 0) {
      results = results.slice(0, filter.limit);
    }

    return results.map((r) => JSON.parse(JSON.stringify(r)));
  }

  public async update(id: string, updates: Partial<AuthorizationDecision>): Promise<AuthorizationDecision | null> {
    const existing = this.storage.get(id);
    if (!existing) return null;

    const updated = {
      ...existing,
      ...updates,
      // Strictly maintain canProceedToPayment invariant: must be APPROVED
      canProceedToPayment: (updates.status ?? existing.status) === 'APPROVED',
    };

    this.storage.set(id, updated);
    return JSON.parse(JSON.stringify(updated));
  }

  public async count(): Promise<number> {
    return this.storage.size;
  }

  private seedInitialAudits(): void {
    const seeds: AuthorizationDecision[] = [
      {
        decisionId: 'auth_dec_9481',
        status: 'APPROVED',
        canProceedToPayment: true,
        purchaseIntent: {
          id: 'intent_01',
          agentId: 'DevOps-Autonomous-Bot-4',
          merchantName: 'GitHub Inc.',
          merchantDomain: 'github.com',
          category: 'Developer Infrastructure',
          amount: 45.00,
          currency: 'USD',
          description: 'GitHub Copilot seat renewal',
          userBudgetLimit: 500.00,
        },
        evaluatedAt: new Date(Date.now() - 1000 * 60 * 3).toISOString(),
        policyVersion: '1.0.0',
        reasonCodes: ['AUTO_APPROVAL_THRESHOLD_SATISFIED', 'WITHIN_USER_BUDGET'],
        explanation: 'Purchase amount of $45.00 USD is within the $100.00 auto-approval limit and under user budget limit of $500.00. All policy checks passed.',
        policyChecks: [
          { checkName: 'CURRENCY_SUPPORTED', status: 'PASSED', message: 'Currency USD is supported.' },
          { checkName: 'AMOUNT_VALIDATION', status: 'PASSED', message: 'Amount $45.00 is positive and finite.' },
          { checkName: 'USER_BUDGET_CAP', status: 'PASSED', message: 'Amount $45.00 is within user budget limit of $500.00.' },
          { checkName: 'AUTO_APPROVAL_THRESHOLD', status: 'PASSED', message: 'Amount $45.00 <= $100.00 auto-approval threshold.' },
          { checkName: 'MERCHANT_SECURITY', status: 'PASSED', message: 'Domain github.com is verified and not restricted.' },
        ],
      },
      {
        decisionId: 'auth_dec_9480',
        status: 'REVIEW_REQUIRED',
        canProceedToPayment: false,
        purchaseIntent: {
          id: 'intent_02',
          agentId: 'Procurement-Agent-Alpha',
          merchantName: 'CloudScale Global Ltd.',
          merchantDomain: 'cloudscale-infra.io',
          category: 'Cloud Hosting Services',
          amount: 320.00,
          currency: 'USD',
          description: 'Monthly staging server cluster',
          userBudgetLimit: 1000.00,
        },
        evaluatedAt: new Date(Date.now() - 1000 * 60 * 18).toISOString(),
        policyVersion: '1.0.0',
        reasonCodes: ['AMOUNT_REQUIRES_REVIEW'],
        explanation: 'Purchase amount of $320.00 USD exceeds the $100.00 auto-approval threshold and falls within the review window ($100 - $500). Human review required.',
        policyChecks: [
          { checkName: 'CURRENCY_SUPPORTED', status: 'PASSED', message: 'Currency USD is supported.' },
          { checkName: 'AMOUNT_VALIDATION', status: 'PASSED', message: 'Amount $320.00 is positive and finite.' },
          { checkName: 'USER_BUDGET_CAP', status: 'PASSED', message: 'Amount $320.00 is within user budget limit of $1000.00.' },
          { checkName: 'AUTO_APPROVAL_THRESHOLD', status: 'WARNING', message: 'Amount $320.00 exceeds $100.00 auto-approval cap.' },
          { checkName: 'MERCHANT_SECURITY', status: 'PASSED', message: 'Domain cloudscale-infra.io has acceptable reputation.' },
        ],
      },
      {
        decisionId: 'auth_dec_9479',
        status: 'REVIEW_REQUIRED',
        canProceedToPayment: false,
        purchaseIntent: {
          id: 'intent_03',
          agentId: 'Procurement-Agent-Alpha',
          merchantName: 'DataGrid Supercompute',
          merchantDomain: 'datagrid-compute.com',
          category: 'Infrastructure',
          amount: 1450.00,
          currency: 'USD',
          description: 'Dedicated GPU training cluster allocation',
          userBudgetLimit: 2000.00,
        },
        evaluatedAt: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
        policyVersion: '1.0.0',
        reasonCodes: ['EXPLICIT_APPROVAL_REQUIRED'],
        explanation: 'Purchase amount of $1,450.00 USD exceeds the $500.00 review threshold. Purchases above $500 require explicit supervisor sign-off.',
        policyChecks: [
          { checkName: 'CURRENCY_SUPPORTED', status: 'PASSED', message: 'Currency USD is supported.' },
          { checkName: 'AMOUNT_VALIDATION', status: 'PASSED', message: 'Amount $1450.00 is positive and finite.' },
          { checkName: 'USER_BUDGET_CAP', status: 'PASSED', message: 'Amount $1450.00 is within user budget limit of $2000.00.' },
          { checkName: 'HIGH_VALUE_THRESHOLD', status: 'WARNING', message: 'Amount $1450.00 exceeds $500.00 high-value threshold.' },
          { checkName: 'MERCHANT_SECURITY', status: 'PASSED', message: 'Domain datagrid-compute.com passed validation.' },
        ],
      },
      {
        decisionId: 'auth_dec_9478',
        status: 'BLOCKED',
        canProceedToPayment: false,
        purchaseIntent: {
          id: 'intent_04',
          agentId: 'Research-Scraper-Node',
          merchantName: 'FastPay Crypto Exchange',
          merchantDomain: 'crypto-cards-fast.xyz',
          category: 'Digital Currency / Vouchers',
          amount: 850.00,
          currency: 'USD',
          description: 'Gift card vouchers checkout',
        },
        evaluatedAt: new Date(Date.now() - 1000 * 60 * 80).toISOString(),
        policyVersion: '1.0.0',
        reasonCodes: ['PROHIBITED_CATEGORY', 'RESTRICTED_DOMAIN_TLD'],
        explanation: 'Purchase violates corporate policies: Prohibited merchant category (vouchers/crypto) and untrusted domain extension (.xyz). Payment blocked before reaching payment processor.',
        policyChecks: [
          { checkName: 'CURRENCY_SUPPORTED', status: 'PASSED', message: 'Currency USD is supported.' },
          { checkName: 'PROHIBITED_CATEGORY', status: 'FAILED', message: 'Category "Digital Currency / Vouchers" is prohibited.' },
          { checkName: 'RESTRICTED_DOMAIN_TLD', status: 'FAILED', message: 'Top-level domain ".xyz" is flagged as untrusted.' },
        ],
      },
    ];

    for (const seed of seeds) {
      this.storage.set(seed.decisionId, seed);
    }
  }
}

export const inMemoryDecisionRepository = new InMemoryDecisionRepository();
export const decisionRepository: IAuthorizationDecisionRepository = inMemoryDecisionRepository;
