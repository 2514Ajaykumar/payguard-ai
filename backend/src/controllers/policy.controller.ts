import { Request, Response, NextFunction } from 'express';
import { policyService } from '../services/policy.service';

export class PolicyController {
  public getPolicies = (req: Request, res: Response, next: NextFunction): void => {
    try {
      const policy = policyService.getPolicy();
      res.status(200).json({
        success: true,
        data: policy,
      });
    } catch (error) {
      next(error);
    }
  };

  public updatePolicies = (req: Request, res: Response, next: NextFunction): void => {
    try {
      const updates = req.body;
      if (!updates || typeof updates !== 'object') {
        res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_PAYLOAD',
            message: 'Request body must be a JSON object with policy parameters.',
          },
        });
        return;
      }

      const updatedPolicy = policyService.updatePolicy(updates);
      res.status(200).json({
        success: true,
        message: 'Spending policies updated successfully.',
        data: updatedPolicy,
      });
    } catch (error) {
      next(error);
    }
  };

  public resetPolicies = (req: Request, res: Response, next: NextFunction): void => {
    try {
      const resetPolicy = policyService.resetPolicy();
      res.status(200).json({
        success: true,
        message: 'Spending policies reset to defaults.',
        data: resetPolicy,
      });
    } catch (error) {
      next(error);
    }
  };
}

export const policyController = new PolicyController();
