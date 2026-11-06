import { PaymentRecord, PaymentFilter } from '../types/payment.types';

export interface IPaymentRepository {
  save(payment: PaymentRecord): Promise<PaymentRecord>;
  findById(paymentId: string): Promise<PaymentRecord | null>;
  findByOrderId(orderId: string): Promise<PaymentRecord | null>;
  findByDecisionId(decisionId: string): Promise<PaymentRecord | null>;
  list(filter?: PaymentFilter): Promise<PaymentRecord[]>;
  update(paymentId: string, updates: Partial<PaymentRecord>): Promise<PaymentRecord | null>;
  count(): Promise<number>;
}

/**
 * In-Memory Payment Audit Repository.
 * 
 * NOTE: Storage label: [TEMPORARY_IN_MEMORY_PAYMENT_STORE]
 * This implementation provides ephemeral audit storage during Phase 3.
 * PostgreSQL database integration is provided via PrismaPaymentRepository.
 */
export class InMemoryPaymentRepository implements IPaymentRepository {
  private readonly storage: Map<string, PaymentRecord> = new Map();

  public async save(payment: PaymentRecord): Promise<PaymentRecord> {
    const record = JSON.parse(JSON.stringify(payment));
    this.storage.set(payment.paymentId, record);
    return record;
  }

  public async findById(paymentId: string): Promise<PaymentRecord | null> {
    const record = this.storage.get(paymentId);
    return record ? JSON.parse(JSON.stringify(record)) : null;
  }

  public async findByOrderId(orderId: string): Promise<PaymentRecord | null> {
    for (const record of this.storage.values()) {
      if (record.paypalOrderId === orderId) {
        return JSON.parse(JSON.stringify(record));
      }
    }
    return null;
  }

  public async findByDecisionId(decisionId: string): Promise<PaymentRecord | null> {
    const matching = Array.from(this.storage.values()).filter(
      (r) => r.decisionId === decisionId
    );

    if (matching.length === 0) return null;

    // 1. If any record has already been settled/captured, that record has absolute precedence
    // to strictly preserve idempotency and prevent duplicate payments
    const settled = matching.find(
      (r) => r.status === 'COMPLETED' || r.status === 'RECONCILIATION_REQUIRED'
    );
    if (settled) {
      return JSON.parse(JSON.stringify(settled));
    }

    // 2. Sort matching records by createdAt descending (newest first)
    matching.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    // 3. Prefer active records (CREATED, APPROVED_BY_BUYER) over terminal CANCELLED/FAILED records
    const active = matching.find(
      (r) => r.status === 'CREATED' || r.status === 'APPROVED_BY_BUYER'
    );
    if (active) {
      return JSON.parse(JSON.stringify(active));
    }

    // 4. Return the newest record
    return JSON.parse(JSON.stringify(matching[0]));
  }

  public async list(filter?: PaymentFilter): Promise<PaymentRecord[]> {
    let results = Array.from(this.storage.values());

    if (filter?.decisionId) {
      results = results.filter((p) => p.decisionId === filter.decisionId);
    }

    if (filter?.status) {
      results = results.filter((p) => p.status === filter.status);
    }

    results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    if (filter?.limit && filter.limit > 0) {
      results = results.slice(0, filter.limit);
    }

    return results.map((r) => JSON.parse(JSON.stringify(r)));
  }

  public async update(paymentId: string, updates: Partial<PaymentRecord>): Promise<PaymentRecord | null> {
    const existing = this.storage.get(paymentId);
    if (!existing) return null;

    const updated: PaymentRecord = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    this.storage.set(paymentId, updated);
    return JSON.parse(JSON.stringify(updated));
  }

  public async count(): Promise<number> {
    return this.storage.size;
  }
}

export const inMemoryPaymentRepository = new InMemoryPaymentRepository();
export const paymentRepository: IPaymentRepository = inMemoryPaymentRepository;
