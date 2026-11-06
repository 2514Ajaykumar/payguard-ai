import {
  BackendHealthResponse,
  AuthorizationDecision,
  PurchaseIntent,
  SpendingPolicy,
  DecisionStatus,
  CreateOrderResult,
  CaptureOrderResult,
  PaymentRecord,
  DiscoveryRequest,
  DiscoveryResponse,
  ParseIntentResponse,
} from '../types';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

export interface HealthCheckResult {
  success: boolean;
  data: BackendHealthResponse['data'] | null;
  latencyMs: number;
  error?: string;
}

export const checkBackendHealth = async (): Promise<HealthCheckResult> => {
  const startTime = performance.now();
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    const response = await fetch(`${API_BASE_URL}/health`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    const latencyMs = Math.round(performance.now() - startTime);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const json: BackendHealthResponse = await response.json();

    if (json.success && json.data) {
      return {
        success: true,
        data: json.data,
        latencyMs,
      };
    } else {
      return {
        success: false,
        data: null,
        latencyMs,
        error: json.error?.message || 'Invalid response structure from backend',
      };
    }
  } catch (err: unknown) {
    const latencyMs = Math.round(performance.now() - startTime);
    const message = err instanceof Error ? err.message : 'Unknown network error';
    return {
      success: false,
      data: null,
      latencyMs,
      error: message,
    };
  }
};

/**
 * Authoritatively evaluate purchase intent using the PayGuard Backend Engine.
 * POST /api/authorization/evaluate
 */
export const evaluatePurchaseIntent = async (
  intent: PurchaseIntent
): Promise<{ success: boolean; data?: AuthorizationDecision; error?: string }> => {
  try {
    const response = await fetch(`${API_BASE_URL}/authorization/evaluate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(intent),
    });

    const json = await response.json();

    if (!response.ok || !json.success) {
      return {
        success: false,
        error: json.error?.message || `Evaluation request failed with status ${response.status}`,
      };
    }

    return {
      success: true,
      data: json.data as AuthorizationDecision,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Network error during intent evaluation';
    return {
      success: false,
      error: message,
    };
  }
};

/**
 * Create a PayPal Sandbox Order for an APPROVED decision.
 * POST /api/payments/create-order
 */
export const createPaymentOrder = async (
  decisionId: string,
  options?: { customDescription?: string; retry?: boolean; amount?: number; currency?: string }
): Promise<{ success: boolean; data?: CreateOrderResult; error?: string }> => {
  try {
    const response = await fetch(`${API_BASE_URL}/payments/create-order`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        decisionId,
        customDescription: options?.customDescription,
        retry: options?.retry,
        amount: options?.amount,
        currency: options?.currency,
      }),
    });

    const json = await response.json();

    if (!response.ok || !json.success) {
      return {
        success: false,
        error: json.error?.message || `Failed to create PayPal order (${response.status})`,
      };
    }

    return {
      success: true,
      data: json.data as CreateOrderResult,
    };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Network error creating PayPal order',
    };
  }
};

/**
 * Capture an approved PayPal Sandbox Order on the server.
 * POST /api/payments/capture-order
 */
export const capturePaymentOrder = async (
  orderId: string
): Promise<{ success: boolean; data?: CaptureOrderResult; error?: string }> => {
  try {
    const response = await fetch(`${API_BASE_URL}/payments/capture-order`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ orderId }),
    });

    const json = await response.json();

    if (!response.ok || !json.success) {
      return {
        success: false,
        error: json.error?.message || `Failed to capture PayPal order (${response.status})`,
      };
    }

    return {
      success: true,
      data: json.data as CaptureOrderResult,
    };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Network error capturing PayPal order',
    };
  }
};

/**
 * Record buyer cancellation.
 * POST /api/payments/cancel-order
 */
export const cancelPaymentOrder = async (
  orderId: string
): Promise<{ success: boolean; data?: PaymentRecord; error?: string }> => {
  try {
    const response = await fetch(`${API_BASE_URL}/payments/cancel-order`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ orderId }),
    });

    const json = await response.json();
    if (!response.ok || !json.success) {
      return { success: false, error: json.error?.message || 'Failed to cancel order' };
    }

    return { success: true, data: json.data };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Network error' };
  }
};

/**
 * Fetch payment record details.
 * GET /api/payments/order/:orderId
 */
export const getPaymentDetails = async (
  orderId: string
): Promise<{ success: boolean; data?: PaymentRecord; error?: string }> => {
  try {
    const response = await fetch(`${API_BASE_URL}/payments/order/${encodeURIComponent(orderId)}`, {
      headers: { Accept: 'application/json' },
    });
    const json = await response.json();
    if (!response.ok || !json.success) {
      return { success: false, error: json.error?.message || 'Failed to get payment' };
    }
    return { success: true, data: json.data };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Network error' };
  }
};

/**
 * List payment records.
 * GET /api/payments
 */
export const fetchPayments = async (): Promise<{
  success: boolean;
  data: PaymentRecord[];
  error?: string;
}> => {
  try {
    const response = await fetch(`${API_BASE_URL}/payments`, {
      headers: { Accept: 'application/json' },
    });
    const json = await response.json();
    if (!response.ok || !json.success) {
      return { success: false, data: [], error: json.error?.message || 'Failed to list payments' };
    }
    return { success: true, data: json.data || [] };
  } catch (err: unknown) {
    return { success: false, data: [], error: err instanceof Error ? err.message : 'Network error' };
  }
};

/**
 * Retrieve auditable decision history.
 * GET /api/authorization/decisions
 */
export const fetchDecisions = async (filter?: {
  status?: DecisionStatus;
}): Promise<{ success: boolean; data: AuthorizationDecision[]; error?: string }> => {
  try {
    const query = filter?.status ? `?status=${filter.status}` : '';
    const response = await fetch(`${API_BASE_URL}/authorization/decisions${query}`, {
      headers: { Accept: 'application/json' },
    });

    const json = await response.json();

    if (!response.ok || !json.success) {
      return {
        success: false,
        data: [],
        error: json.error?.message || 'Failed to fetch decisions',
      };
    }

    return {
      success: true,
      data: json.data || [],
    };
  } catch (err: unknown) {
    return {
      success: false,
      data: [],
      error: err instanceof Error ? err.message : 'Network error fetching decisions',
    };
  }
};

/**
 * Submit manual supervisor review for a REVIEW_REQUIRED decision.
 * POST /api/authorization/decisions/:id/review
 */
export const submitReview = async (
  decisionId: string,
  action: 'APPROVE' | 'REJECT',
  notes?: string
): Promise<{ success: boolean; data?: AuthorizationDecision; error?: string }> => {
  try {
    const response = await fetch(`${API_BASE_URL}/authorization/decisions/${decisionId}/review`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        action,
        reviewerId: 'supervisor_admin',
        notes: notes || (action === 'APPROVE' ? 'Approved by dashboard supervisor' : 'Rejected by supervisor'),
      }),
    });

    const json = await response.json();

    if (!response.ok || !json.success) {
      return {
        success: false,
        error: json.error?.message || 'Failed to submit review',
      };
    }

    return {
      success: true,
      data: json.data as AuthorizationDecision,
    };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Network error submitting review',
    };
  }
};

/**
 * Retrieve active spending policies.
 * GET /api/policies
 */
export const fetchPolicies = async (): Promise<{
  success: boolean;
  data?: SpendingPolicy;
  error?: string;
}> => {
  try {
    const response = await fetch(`${API_BASE_URL}/policies`, {
      headers: { Accept: 'application/json' },
    });
    const json = await response.json();
    if (!response.ok || !json.success) {
      return { success: false, error: json.error?.message || 'Failed to fetch policies' };
    }
    return { success: true, data: json.data };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Network error' };
  }
};

/**
 * Update spending policies.
 * PUT /api/policies
 */
export const updatePolicies = async (
  updates: Partial<SpendingPolicy>
): Promise<{ success: boolean; data?: SpendingPolicy; error?: string }> => {
  try {
    const response = await fetch(`${API_BASE_URL}/policies`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(updates),
    });
    const json = await response.json();
    if (!response.ok || !json.success) {
      return { success: false, error: json.error?.message || 'Failed to update policy' };
    }
    return { success: true, data: json.data };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Network error' };
  }
};

/**
 * Reset policies to default.
 * POST /api/policies/reset
 */
export const resetPolicies = async (): Promise<{
  success: boolean;
  data?: SpendingPolicy;
  error?: string;
}> => {
  try {
    const response = await fetch(`${API_BASE_URL}/policies/reset`, {
      method: 'POST',
      headers: { Accept: 'application/json' },
    });
    const json = await response.json();
    if (!response.ok || !json.success) {
      return { success: false, error: json.error?.message || 'Failed to reset policy' };
    }
    return { success: true, data: json.data };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Network error' };
  }
};

/**
 * Discover merchant and product pricing options using Tavily search and Groq LLM.
 * POST /api/agent/discover
 */
export const discoverProducts = async (
  request: DiscoveryRequest
): Promise<{ success: boolean; data?: DiscoveryResponse; error?: string }> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 20000);

  try {
    const response = await fetch(`${API_BASE_URL}/agent/discover`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(request),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const json = await response.json();

    if (!response.ok || !json.success) {
      return {
        success: false,
        error: json.error?.message || `Discovery request failed with status ${response.status}`,
      };
    }

    return {
      success: true,
      data: json.data as DiscoveryResponse,
    };
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    let message = 'Network error during product discovery';
    if (err instanceof Error) {
      if (err.name === 'AbortError') {
        message = 'Discovery request timed out. Please try again.';
      } else {
        message = err.message;
      }
    }
    return {
      success: false,
      error: message,
    };
  }
};

/**
 * Retrieve a specific auditable decision by ID from the backend.
 * GET /api/authorization/decisions/:id
 */
export const fetchDecisionById = async (
  decisionId: string
): Promise<{ success: boolean; data?: AuthorizationDecision; error?: string }> => {
  try {
    const response = await fetch(`${API_BASE_URL}/authorization/decisions/${encodeURIComponent(decisionId)}`, {
      headers: { Accept: 'application/json' },
    });

    const json = await response.json();

    if (!response.ok || !json.success) {
      return {
        success: false,
        error: json.error?.message || `Failed to fetch decision (${response.status})`,
      };
    }

    return {
      success: true,
      data: json.data as AuthorizationDecision,
    };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Network error fetching decision',
    };
  }
};

/**
 * Parse natural language purchase intent into structured fields using Groq LLM.
 * POST /api/agent/parse-intent
 */
export const parsePurchaseIntent = async (
  message: string
): Promise<{ success: boolean; data?: ParseIntentResponse; error?: string }> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(`${API_BASE_URL}/agent/parse-intent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ message }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const json = await response.json();

    if (!response.ok || !json.success) {
      return {
        success: false,
        error: json.error?.message || `Intent extraction failed with status ${response.status}`,
      };
    }

    return {
      success: true,
      data: json.data as ParseIntentResponse,
    };
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    let errorMsg = 'Network error during intent extraction';
    if (err instanceof Error) {
      if (err.name === 'AbortError') {
        errorMsg = 'Intent extraction request timed out. Please try again.';
      } else {
        errorMsg = err.message;
      }
    }
    return {
      success: false,
      error: errorMsg,
    };
  }
};


