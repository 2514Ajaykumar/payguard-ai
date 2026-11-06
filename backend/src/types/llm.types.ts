export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMCompletionOptions {
  message: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface LLMCompletionResult {
  response: string;
  model: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}

export interface GroqChatCompletionResponse {
  id?: string;
  object?: string;
  created?: number;
  model?: string;
  choices: Array<{
    index?: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason?: string;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

export interface TestLLMRequest {
  message: string;
  systemPrompt?: string;
}

export interface TestLLMResponse {
  response: string;
}

// Phase 4.2: Structured Purchase Intent Types
export type BillingPeriod = 'monthly' | 'yearly' | 'one_time';

export interface ExtractedPurchaseIntent {
  product: string | null;
  merchant: string | null;
  domain: string | null;
  amount: number | null;
  currency: string | null;
  budget: number | null;
  billingPeriod: BillingPeriod | null;
  description: string;
  missingInformation: string[];
}

export interface ParseIntentRequest {
  message: string;
}

export interface ParseIntentResponse {
  intent: ExtractedPurchaseIntent;
}
