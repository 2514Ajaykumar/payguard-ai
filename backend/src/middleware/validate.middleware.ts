import { Request, Response, NextFunction } from 'express';

export type ValidationRule = (data: Record<string, unknown>) => string | null;

/**
 * Basic request body validator middleware factory.
 * Enforces required fields and custom validation rules without heavy 3rd-party dependencies.
 */
export const validateBody = (requiredFields: string[], customRule?: ValidationRule) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const body = req.body;

    if (!body || typeof body !== 'object') {
      res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_REQUEST_BODY',
          message: 'Request body must be a valid JSON object.',
        },
      });
      return;
    }

    const missingFields: string[] = [];
    for (const field of requiredFields) {
      if (body[field] === undefined || body[field] === null || body[field] === '') {
        missingFields.push(field);
      }
    }

    if (missingFields.length > 0) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_FAILED',
          message: `Missing required field(s): ${missingFields.join(', ')}`,
          details: { missingFields },
        },
      });
      return;
    }

    if (customRule) {
      const errorMsg = customRule(body as Record<string, unknown>);
      if (errorMsg) {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_FAILED',
            message: errorMsg,
          },
        });
        return;
      }
    }

    next();
  };
};
