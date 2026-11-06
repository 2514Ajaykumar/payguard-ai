import { Request, Response, NextFunction } from 'express';
import { healthService } from '../services/health.service';

export class HealthController {
  public getHealth = (req: Request, res: Response, next: NextFunction): void => {
    try {
      const health = healthService.getHealthStatus();
      res.status(200).json({
        success: true,
        data: health,
      });
    } catch (error) {
      next(error);
    }
  };
}

export const healthController = new HealthController();
