import { PrismaClient, Prisma, PaymentRecord as PrismaPaymentRecord } from '@prisma/client';
import { prisma as defaultPrisma } from '../db/prisma';
import {
  PaymentRecord,
  PaymentFilter,
  PaymentStatus,
  SettlementMismatchDetails,
} from '../types/payment.types';
import { IPaymentRepository } from './payment.repository';

export class PrismaPaymentRepository implements IPaymentRepository {
  private readonly prisma: PrismaClient;

  constructor(client: PrismaClient = defaultPrisma) {
    this.prisma = client;
  }

  public async save(payment: PaymentRecord): Promise<PaymentRecord> {
    const data: Prisma.PaymentRecordCreateInput = {
      paymentId: payment.paymentId,
      decision: {
        connect: { decisionId: payment.decisionId },
      },
      paypalOrderId: payment.paypalOrderId,
      paypalCaptureId: payment.paypalCaptureId ?? null,
      amount: new Prisma.Decimal(payment.amount),
      currency: payment.currency,
      status: payment.status,
      approvalUrl: payment.approvalUrl ?? null,
      payerId: payment.payerId ?? null,
      payerEmail: payment.payerEmail ?? null,
      failureReason: payment.failureReason ?? null,
      settlementMismatch: payment.settlementMismatch
        ? (payment.settlementMismatch as unknown as Prisma.InputJsonValue)
        : Prisma.JsonNull,
      metadata: payment.metadata
        ? (payment.metadata as unknown as Prisma.InputJsonValue)
        : Prisma.JsonNull,
      createdAt: new Date(payment.createdAt),
      updatedAt: new Date(payment.updatedAt),
    };

    const saved = await this.prisma.paymentRecord.create({ data });
    return this.mapToDomain(saved);
  }

  public async findById(paymentId: string): Promise<PaymentRecord | null> {
    const record = await this.prisma.paymentRecord.findUnique({
      where: { paymentId },
    });
    return record ? this.mapToDomain(record) : null;
  }

  public async findByOrderId(orderId: string): Promise<PaymentRecord | null> {
    const record = await this.prisma.paymentRecord.findUnique({
      where: { paypalOrderId: orderId },
    });
    return record ? this.mapToDomain(record) : null;
  }

  public async findByDecisionId(decisionId: string): Promise<PaymentRecord | null> {
    const matching = await this.prisma.paymentRecord.findMany({
      where: { decisionId },
      orderBy: { createdAt: 'desc' },
    });

    if (matching.length === 0) return null;

    // 1. If any record has already been settled/captured, that record has absolute precedence
    // to strictly preserve idempotency and prevent duplicate payments
    const settled = matching.find(
      (r) => r.status === 'COMPLETED' || r.status === 'RECONCILIATION_REQUIRED'
    );
    if (settled) {
      return this.mapToDomain(settled);
    }

    // 2. Prefer active records (CREATED, APPROVED_BY_BUYER) over terminal CANCELLED/FAILED records
    const active = matching.find(
      (r) => r.status === 'CREATED' || r.status === 'APPROVED_BY_BUYER'
    );
    if (active) {
      return this.mapToDomain(active);
    }

    // 3. Return the newest record
    return this.mapToDomain(matching[0]);
  }

  public async list(filter?: PaymentFilter): Promise<PaymentRecord[]> {
    const where: Prisma.PaymentRecordWhereInput = {};

    if (filter?.decisionId) {
      where.decisionId = filter.decisionId;
    }

    if (filter?.status) {
      where.status = filter.status;
    }

    const records = await this.prisma.paymentRecord.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: filter?.limit && filter.limit > 0 ? filter.limit : undefined,
    });

    return records.map((r) => this.mapToDomain(r));
  }

  public async update(paymentId: string, updates: Partial<PaymentRecord>): Promise<PaymentRecord | null> {
    const existing = await this.prisma.paymentRecord.findUnique({
      where: { paymentId },
    });
    if (!existing) return null;

    const data: Prisma.PaymentRecordUpdateInput = {
      updatedAt: new Date(),
    };

    if (updates.status !== undefined) {
      data.status = updates.status;
    }
    if (updates.paypalCaptureId !== undefined) {
      data.paypalCaptureId = updates.paypalCaptureId ?? null;
    }
    if (updates.payerId !== undefined) {
      data.payerId = updates.payerId ?? null;
    }
    if (updates.payerEmail !== undefined) {
      data.payerEmail = updates.payerEmail ?? null;
    }
    if (updates.approvalUrl !== undefined) {
      data.approvalUrl = updates.approvalUrl ?? null;
    }
    if (updates.failureReason !== undefined) {
      data.failureReason = updates.failureReason ?? null;
    }
    if (updates.amount !== undefined) {
      data.amount = new Prisma.Decimal(updates.amount);
    }
    if (updates.currency !== undefined) {
      data.currency = updates.currency;
    }
    if (updates.settlementMismatch !== undefined) {
      data.settlementMismatch = updates.settlementMismatch
        ? (updates.settlementMismatch as unknown as Prisma.InputJsonValue)
        : Prisma.JsonNull;
    }
    if (updates.metadata !== undefined) {
      data.metadata = updates.metadata
        ? (updates.metadata as unknown as Prisma.InputJsonValue)
        : Prisma.JsonNull;
    }

    const updated = await this.prisma.paymentRecord.update({
      where: { paymentId },
      data,
    });

    return this.mapToDomain(updated);
  }

  public async count(): Promise<number> {
    return this.prisma.paymentRecord.count();
  }

  private mapToDomain(record: PrismaPaymentRecord): PaymentRecord {
    return {
      paymentId: record.paymentId,
      decisionId: record.decisionId,
      paypalOrderId: record.paypalOrderId,
      paypalCaptureId: record.paypalCaptureId ?? undefined,
      amount: Number(record.amount),
      currency: record.currency,
      status: record.status as PaymentStatus,
      approvalUrl: record.approvalUrl ?? undefined,
      payerId: record.payerId ?? undefined,
      payerEmail: record.payerEmail ?? undefined,
      failureReason: record.failureReason ?? undefined,
      settlementMismatch: (record.settlementMismatch as unknown as SettlementMismatchDetails) ?? undefined,
      metadata: (record.metadata as unknown as Record<string, unknown>) ?? undefined,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }
}

