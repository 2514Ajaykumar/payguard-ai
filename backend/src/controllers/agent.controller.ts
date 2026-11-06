import { Request, Response, NextFunction } from 'express';
import { LLMService, llmService } from '../services/llm.service';
import { DiscoveryService, discoveryService } from '../services/discovery.service';

export class AgentController {
  constructor(
    private readonly service: LLMService = llmService,
    private readonly discovery: DiscoveryService = discoveryService
  ) {}

  public testLLM = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { message, systemPrompt } = req.body || {};

      if (!message || typeof message !== 'string' || message.trim().length === 0) {
        res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_REQUEST',
            message: "The 'message' field is required and must be a non-empty string.",
          },
        });
        return;
      }

      const defaultSystemPrompt =
        'You are the intelligent assistant for PayGuard AI, an AI pre-transaction guardrail and policy enforcement layer for PayPal payments.';

      const result = await this.service.generateCompletion({
        message: message.trim(),
        systemPrompt:
          typeof systemPrompt === 'string' && systemPrompt.trim().length > 0
            ? systemPrompt.trim()
            : defaultSystemPrompt,
      });

      res.status(200).json({
        success: true,
        data: {
          response: result.response,
        },
      });
    } catch (error) {
      next(error);
    }
  };

  public parseIntent = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { message } = req.body || {};

      if (!message || typeof message !== 'string' || message.trim().length === 0) {
        res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_REQUEST',
            message: "The 'message' field is required and must be a non-empty string.",
          },
        });
        return;
      }

      const intent = await this.service.extractPurchaseIntent(message.trim());

      res.status(200).json({
        success: true,
        data: {
          intent,
        },
      });
    } catch (error) {
      next(error);
    }
  };

  public discover = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { message, maxResults } = req.body || {};

      if (!message || typeof message !== 'string' || message.trim().length === 0) {
        res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_REQUEST',
            message: "The 'message' field is required and must be a non-empty string.",
          },
        });
        return;
      }

      const discoveryResult = await this.discovery.discoverProducts(
        message.trim(),
        typeof maxResults === 'number' ? maxResults : 5
      );

      res.status(200).json({
        success: true,
        data: discoveryResult,
      });
    } catch (error) {
      next(error);
    }
  };
}

export const agentController = new AgentController();
