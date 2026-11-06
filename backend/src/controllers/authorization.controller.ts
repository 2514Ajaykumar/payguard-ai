import { Request, Response, NextFunction } from 'express';
import { authorizationService } from '../services/authorization.service';
import { DecisionStatus } from '../types/authorization.types';
import { config } from '../config/env';

export class AuthorizationController {
  public evaluate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const decision = await authorizationService.evaluatePurchaseIntent(req.body);

      // Return 200 with structured decision. The decision.status and decision.canProceedToPayment
      // are authoritative.
      res.status(200).json({
        success: true,
        data: decision,
      });
    } catch (error) {
      next(error);
    }
  };

  public listDecisions = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { status, agentId, limit } = req.query;
      const parsedLimit = limit ? parseInt(limit as string, 10) : undefined;

      const decisions = await authorizationService.listDecisions({
        status: status as DecisionStatus | undefined,
        agentId: agentId as string | undefined,
        limit: parsedLimit && !isNaN(parsedLimit) ? parsedLimit : undefined,
      });

      res.status(200).json({
        success: true,
        count: decisions.length,
        storageType: config.storageDriver === 'postgres' ? 'POSTGRESQL_PRISMA_STORE' : 'TEMPORARY_IN_MEMORY_STORE',
        data: decisions,
      });
    } catch (error) {
      next(error);
    }
  };

  public getDecisionById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const decision = await authorizationService.getDecision(id);

      if (!decision) {
        res.status(404).json({
          success: false,
          error: {
            code: 'DECISION_NOT_FOUND',
            message: `Authorization decision with ID "${id}" was not found.`,
          },
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: decision,
      });
    } catch (error) {
      next(error);
    }
  };

  public reviewDecision = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const { action, reviewerId, notes } = req.body;

      if (action !== 'APPROVE' && action !== 'REJECT') {
        res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_REVIEW_ACTION',
            message: 'Action must be either "APPROVE" or "REJECT".',
          },
        });
        return;
      }

      const updated = await authorizationService.reviewDecision(
        id,
        action,
        reviewerId || 'supervisor_admin',
        notes
      );

      res.status(200).json({
        success: true,
        message: `Decision successfully updated to ${updated.status}.`,
        data: updated,
      });
    } catch (error) {
      next(error);
    }
  };
}

export const authorizationController = new AuthorizationController();
