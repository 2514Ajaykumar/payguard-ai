import { PrismaClient, Prisma, AuthorizationDecision as PrismaDecisionRecord } from '@prisma/client';
import { prisma as defaultPrisma } from '../db/prisma';
import {
  AuthorizationDecision,
  DecisionFilter,
  DecisionStatus,
  PolicyCheckResult,
  PurchaseIntent,
  ReviewMetadata,
} from '../types/authorization.types';
import { IAuthorizationDecisionRepository } from './decision.repository';

export class PrismaDecisionRepository implements IAuthorizationDecisionRepository {
  private readonly prisma: PrismaClient;

  constructor(client: PrismaClient = defaultPrisma) {
    this.prisma = client;
    // NOTE: Per requirement, do not automatically reseed historical demo records on every startup.
  }

  public async save(decision: AuthorizationDecision): Promise<AuthorizationDecision> {
    const intent = decision.purchaseIntent;

    const data: Prisma.AuthorizationDecisionCreateInput = {
      decisionId: decision.decisionId,
      status: decision.status,
      canProceedToPayment: decision.canProceedToPayment,
      intentId: intent.id ?? null,
      agentId: intent.agentId,
      merchantName: intent.merchantName,
      merchantDomain: intent.merchantDomain ?? null,
      category: intent.category ?? null,
      amount: new Prisma.Decimal(intent.amount),
      currency: intent.currency,
      description: intent.description ?? null,
      userBudgetLimit:
        intent.userBudgetLimit !== undefined && intent.userBudgetLimit !== null
          ? new Prisma.Decimal(intent.userBudgetLimit)
          : null,
      intentMetadata: intent.metadata ? (intent.metadata as Prisma.InputJsonValue) : Prisma.JsonNull,
      policyVersion: decision.policyVersion,
      reasonCodes: decision.reasonCodes,
      explanation: decision.explanation,
      policyChecks: decision.policyChecks as unknown as Prisma.InputJsonValue,
      riskScore: null,
      reviewedBy: decision.reviewMetadata?.reviewedBy ?? null,
      reviewedAt: decision.reviewMetadata?.reviewedAt ? new Date(decision.reviewMetadata.reviewedAt) : null,
      reviewDecision: decision.reviewMetadata?.reviewDecision ?? null,
      reviewNotes: decision.reviewMetadata?.reviewNotes ?? null,
      evaluatedAt: new Date(decision.evaluatedAt),
    };

    const saved = await this.prisma.authorizationDecision.create({
      data,
    });

    return this.mapToDomain(saved);
  }

  public async findById(id: string): Promise<AuthorizationDecision | null> {
    const record = await this.prisma.authorizationDecision.findUnique({
      where: { decisionId: id },
    });
    return record ? this.mapToDomain(record) : null;
  }

  public async list(filter?: DecisionFilter): Promise<AuthorizationDecision[]> {
    const where: Prisma.AuthorizationDecisionWhereInput = {};

    if (filter?.status) {
      where.status = filter.status;
    }

    if (filter?.agentId) {
      where.agentId = filter.agentId;
    }

    const records = await this.prisma.authorizationDecision.findMany({
      where,
      orderBy: { evaluatedAt: 'desc' },
      take: filter?.limit && filter.limit > 0 ? filter.limit : undefined,
    });

    return records.map((r) => this.mapToDomain(r));
  }

  public async update(id: string, updates: Partial<AuthorizationDecision>): Promise<AuthorizationDecision | null> {
    const existing = await this.prisma.authorizationDecision.findUnique({
      where: { decisionId: id },
    });
    if (!existing) return null;

    const data: Prisma.AuthorizationDecisionUpdateInput = {};

    if (updates.status !== undefined) {
      data.status = updates.status;
    }

    // Strictly maintain canProceedToPayment invariant: must be APPROVED
    const effectiveStatus = updates.status ?? existing.status;
    data.canProceedToPayment = effectiveStatus === 'APPROVED';

    if (updates.explanation !== undefined) {
      data.explanation = updates.explanation;
    }

    if (updates.reasonCodes !== undefined) {
      data.reasonCodes = updates.reasonCodes;
    }

    if (updates.policyChecks !== undefined) {
      data.policyChecks = updates.policyChecks as unknown as Prisma.InputJsonValue;
    }

    if (updates.reviewMetadata !== undefined) {
      data.reviewedBy = updates.reviewMetadata.reviewedBy ?? null;
      data.reviewedAt = updates.reviewMetadata.reviewedAt
        ? new Date(updates.reviewMetadata.reviewedAt)
        : new Date();
      data.reviewDecision = updates.reviewMetadata.reviewDecision ?? null;
      data.reviewNotes = updates.reviewMetadata.reviewNotes ?? null;
    }

    const updated = await this.prisma.authorizationDecision.update({
      where: { decisionId: id },
      data,
    });

    return this.mapToDomain(updated);
  }

  public async count(): Promise<number> {
    return this.prisma.authorizationDecision.count();
  }

  private mapToDomain(record: PrismaDecisionRecord): AuthorizationDecision {
    const purchaseIntent: PurchaseIntent = {
      id: record.intentId ?? undefined,
      agentId: record.agentId,
      merchantName: record.merchantName,
      merchantDomain: record.merchantDomain ?? undefined,
      category: record.category ?? undefined,
      amount: Number(record.amount),
      currency: record.currency,
      description: record.description ?? undefined,
      userBudgetLimit: record.userBudgetLimit !== null ? Number(record.userBudgetLimit) : undefined,
      metadata: (record.intentMetadata as Record<string, unknown>) ?? undefined,
    };

    let reviewMetadata: ReviewMetadata | undefined = undefined;
    if (record.reviewedBy || record.reviewDecision) {
      reviewMetadata = {
        reviewedBy: record.reviewedBy || 'supervisor_admin',
        reviewedAt: record.reviewedAt ? record.reviewedAt.toISOString() : record.updatedAt.toISOString(),
        reviewDecision: (record.reviewDecision as 'MANUALLY_APPROVED' | 'MANUALLY_REJECTED') || 'MANUALLY_APPROVED',
        reviewNotes: record.reviewNotes ?? undefined,
      };
    }

    return {
      decisionId: record.decisionId,
      status: record.status as DecisionStatus,
      canProceedToPayment: record.canProceedToPayment,
      purchaseIntent,
      evaluatedAt: record.evaluatedAt.toISOString(),
      policyVersion: record.policyVersion,
      reasonCodes: record.reasonCodes,
      explanation: record.explanation,
      policyChecks: (record.policyChecks as unknown as PolicyCheckResult[]) || [],
      reviewMetadata,
    };
  }
}

