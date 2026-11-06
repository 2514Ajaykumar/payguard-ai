import { Request, Response, NextFunction } from 'express';
import { paymentService } from '../services/payment.service';
import { config } from '../config/env';

export class PaymentController {
  public createOrder = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { decisionId, customDescription, amount, currency, retry } = req.body;

      if (!decisionId || typeof decisionId !== 'string') {
        res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_DECISION_ID',
            message: 'decisionId is required and must be a valid string.',
          },
        });
        return;
      }

      const result = await paymentService.createOrder(
        { decisionId, customDescription, retry: Boolean(retry) },
        { amount: typeof amount === 'number' ? amount : undefined, currency }
      );

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  public captureOrder = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { orderId } = req.body;

      if (!orderId || typeof orderId !== 'string') {
        res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_ORDER_ID',
            message: 'orderId is required to capture a payment.',
          },
        });
        return;
      }

      const result = await paymentService.captureOrder({ orderId });

      const isReconciliation = result.status === 'RECONCILIATION_REQUIRED';
      res.status(200).json({
        success: true,
        reconciliationRequired: isReconciliation,
        message: isReconciliation
          ? `Settlement reconciliation required: ${result.reconciliationNotes}`
          : 'PayPal payment captured successfully on the server.',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  public cancelOrder = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { orderId } = req.body;

      if (!orderId || typeof orderId !== 'string') {
        res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_ORDER_ID',
            message: 'orderId is required.',
          },
        });
        return;
      }

      const result = await paymentService.handleCancellation(orderId);

      res.status(200).json({
        success: true,
        message: 'Order marked as cancelled.',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  public getPaymentByOrderId = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const orderId = Array.isArray(req.params.orderId) ? req.params.orderId[0] : req.params.orderId;
      const payment = await paymentService.getPaymentByOrderId(orderId);

      if (!payment) {
        res.status(404).json({
          success: false,
          error: {
            code: 'PAYMENT_NOT_FOUND',
            message: `Payment record with PayPal order ID "${orderId}" was not found.`,
          },
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: payment,
      });
    } catch (error) {
      next(error);
    }
  };

  public listPayments = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { decisionId, status, limit } = req.query;
      const parsedLimit = limit ? parseInt(limit as string, 10) : undefined;

      const payments = await paymentService.listPayments({
        decisionId: decisionId as string | undefined,
        status: status as any,
        limit: parsedLimit && !isNaN(parsedLimit) ? parsedLimit : undefined,
      });

      res.status(200).json({
        success: true,
        count: payments.length,
        storageType: config.storageDriver === 'postgres' ? 'POSTGRESQL_PRISMA_PAYMENT_STORE' : 'TEMPORARY_IN_MEMORY_PAYMENT_STORE',
        data: payments,
      });
    } catch (error) {
      next(error);
    }
  };
}

export const paymentController = new PaymentController();
