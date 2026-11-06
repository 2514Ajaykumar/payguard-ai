import { Router, Request, Response } from 'express';
import healthRouter from './health.router';
import policyRouter from './policy.router';
import authorizationRouter from './authorization.router';
import paymentRouter from './payment.router';
import agentRouter from './agent.router';

const router = Router();

// Sub-routers
router.use('/health', healthRouter);
router.use('/policies', policyRouter);
router.use('/authorization', authorizationRouter);
router.use('/payments', paymentRouter);
router.use('/agent', agentRouter);

// GET /api metadata
router.get('/', (req: Request, res: Response) => {
  res.json({
    name: 'PayGuard AI API',
    description: 'Pre-transaction AI Guardrails, PayPal Orders Sandbox Checkout Flow & Groq LLM Engine',
    version: '1.5.0',
    documentation: '/docs',
    endpoints: {
      health: '/api/health',
      policies: '/api/policies',
      evaluateAuthorization: '/api/authorization/evaluate',
      decisionsList: '/api/authorization/decisions',
      createPaymentOrder: '/api/payments/create-order',
      capturePaymentOrder: '/api/payments/capture-order',
      cancelPaymentOrder: '/api/payments/cancel-order',
      listPayments: '/api/payments',
      testLLM: '/api/agent/test-llm',
      parseIntent: '/api/agent/parse-intent',
      discoverProducts: '/api/agent/discover',
    },
    phase: 'Phase 4.3 - Merchant and Product Discovery',
  });
});

export default router;
