import { config } from '../config/env';
import { PayPalOAuthTokenResponse, PayPalOrderResponse, PayPalErrorDetail } from '../types/payment.types';

export type FetchFunction = typeof fetch;

export class PayPalApiError extends Error {
  public readonly statusCode: number;
  public readonly errorName: string;
  public readonly debugId?: string;
  public readonly details: PayPalErrorDetail[];

  constructor(params: {
    statusCode: number;
    errorName: string;
    message: string;
    debugId?: string;
    details?: PayPalErrorDetail[];
    context?: string;
  }) {
    const prefix = params.context ? `${params.context} failed` : 'PayPal API Error';
    const detailsSummary =
      params.details && params.details.length > 0
        ? ` [${params.details.map((d) => d.issue || d.description || '').filter(Boolean).join('; ')}]`
        : '';
    const debugSummary = params.debugId ? ` (debug_id: ${params.debugId})` : '';
    super(
      `${prefix} [${params.errorName}] (HTTP ${params.statusCode}): ${params.message}${detailsSummary}${debugSummary}`
    );
    this.name = 'PayPalApiError';
    this.statusCode = params.statusCode;
    this.errorName = params.errorName;
    this.debugId = params.debugId;
    this.details = params.details || [];
  }
}

export class PayPalService {
  private cachedToken: string | null = null;
  private tokenExpiresAt: number = 0;
  private readonly baseUrl: string;
  private readonly clientId: string;
  private readonly clientSecret: string;
  private fetchFn: FetchFunction;
  private readonly timeoutMs: number;

  constructor(
    customFetch: FetchFunction = fetch,
    options?: { baseUrl?: string; clientId?: string; clientSecret?: string; timeoutMs?: number }
  ) {
    this.fetchFn = customFetch;
    this.baseUrl = options?.baseUrl || config.paypalBaseUrl;
    this.clientId = options?.clientId || config.paypalClientId;
    this.clientSecret = options?.clientSecret || config.paypalClientSecret;
    this.timeoutMs = options?.timeoutMs || 10000;
  }

  public setFetchFn(fn: FetchFunction): void {
    this.fetchFn = fn;
  }

  public isConfigured(): boolean {
    return Boolean(
      this.clientId &&
      this.clientSecret &&
      this.clientId !== 'your_paypal_sandbox_client_id_here' &&
      this.clientSecret !== 'your_paypal_sandbox_client_secret_here'
    );
  }

  /**
   * Safely parse an error response from PayPal REST API.
   * Extracts name, message, debug_id, and details without leaking headers or credentials.
   */
  public async parsePayPalError(response: Response, context: string): Promise<PayPalApiError> {
    const rawText = await response.text().catch(() => '');
    let parsed: any = null;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      return new PayPalApiError({
        statusCode: response.status,
        errorName: `HTTP_${response.status}`,
        message: `${context} returned status ${response.status}.`,
        context,
      });
    }

    const errorName = typeof parsed?.name === 'string' ? parsed.name : `HTTP_${response.status}`;
    const message =
      typeof parsed?.message === 'string'
        ? parsed.message
        : typeof parsed?.error_description === 'string'
          ? parsed.error_description
          : `${context} failed.`;
    const debugId = typeof parsed?.debug_id === 'string' ? parsed.debug_id : undefined;

    const details: PayPalErrorDetail[] = Array.isArray(parsed?.details)
      ? parsed.details.map((d: any) => ({
          issue: typeof d?.issue === 'string' ? d.issue : undefined,
          description: typeof d?.description === 'string' ? d.description : undefined,
          field: typeof d?.field === 'string' ? d.field : undefined,
          value: typeof d?.value === 'string' ? d.value : undefined,
        }))
      : [];

    return new PayPalApiError({
      statusCode: response.status,
      errorName,
      message,
      debugId,
      details,
      context,
    });
  }

  /**
   * Safe fetch with AbortController timeout.
   */
  private async safeFetch(url: string, init?: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      return await this.fetchFn(url, {
        ...init,
        signal: controller.signal,
      });
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error(`PayPal API request to ${url} timed out after ${this.timeoutMs}ms.`);
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Obtains an OAuth 2.0 access token from PayPal Sandbox.
   * Caches token in memory until expiration.
   */
  public async getAccessToken(forceRefresh = false): Promise<string> {
    if (!this.isConfigured()) {
      throw new Error(
        'PayPal Sandbox credentials are not configured. Please set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET in backend/.env.'
      );
    }

    // Return cached token if valid (with 60-second safety margin)
    if (!forceRefresh && this.cachedToken && Date.now() < this.tokenExpiresAt - 60000) {
      return this.cachedToken;
    }

    const authHeader = `Basic ${Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64')}`;
    const tokenUrl = `${this.baseUrl}/v1/oauth2/token`;

    const response = await this.safeFetch(tokenUrl, {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: 'grant_type=client_credentials',
    });

    if (response.status === 401) {
      this.cachedToken = null;
      throw new Error('PayPal authentication failed: Invalid Client ID or Client Secret.');
    }

    if (response.status === 429) {
      throw new Error('PayPal API rate limit reached (HTTP 429). Please retry shortly.');
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`PayPal OAuth token request failed with HTTP ${response.status}: ${errorText}`);
    }

    let data: PayPalOAuthTokenResponse;
    try {
      data = (await response.json()) as PayPalOAuthTokenResponse;
    } catch {
      throw new Error('Malformed JSON response received from PayPal OAuth endpoint.');
    }

    if (!data.access_token || typeof data.access_token !== 'string') {
      throw new Error('PayPal OAuth response did not contain a valid access_token.');
    }

    this.cachedToken = data.access_token;
    const expiresInSec = typeof data.expires_in === 'number' ? data.expires_in : 3600;
    this.tokenExpiresAt = Date.now() + expiresInSec * 1000;

    return this.cachedToken;
  }

  /**
   * Creates a PayPal Sandbox Order with intent CAPTURE.
   */
  public async createOrder(params: {
    referenceId: string;
    amount: number;
    currency: string;
    description: string;
    returnUrl: string;
    cancelUrl: string;
  }): Promise<PayPalOrderResponse> {
    const token = await this.getAccessToken();
    const orderUrl = `${this.baseUrl}/v2/checkout/orders`;

    const payload = {
      intent: 'CAPTURE',
      purchase_units: [
        {
          reference_id: params.referenceId,
          description: params.description.slice(0, 127), // PayPal max description length
          amount: {
            currency_code: params.currency.toUpperCase(),
            value: params.amount.toFixed(2),
          },
        },
      ],
      application_context: {
        brand_name: 'PayGuard AI',
        landing_page: 'NO_PREFERENCE',
        user_action: 'PAY_NOW',
        return_url: params.returnUrl,
        cancel_url: params.cancelUrl,
      },
    };

    const response = await this.safeFetch(orderUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'PayPal-Request-Id': `pg_order_${params.referenceId}_${Date.now()}`,
      },
      body: JSON.stringify(payload),
    });

    if (response.status === 401) {
      // Invalidate token cache on 401 and throw
      this.cachedToken = null;
      throw new Error('PayPal authorization expired or invalid. Please retry.');
    }

    if (!response.ok) {
      throw await this.parsePayPalError(response, 'PayPal create order');
    }

    let order: PayPalOrderResponse;
    try {
      order = (await response.json()) as PayPalOrderResponse;
    } catch {
      throw new Error('Malformed JSON received from PayPal Orders endpoint.');
    }

    if (!order.id || !Array.isArray(order.links)) {
      throw new Error('PayPal create order response is missing required ID or links.');
    }

    return order;
  }

  /**
   * Retrieves an existing PayPal Order details.
   */
  public async getOrder(orderId: string): Promise<PayPalOrderResponse> {
    const token = await this.getAccessToken();
    const orderUrl = `${this.baseUrl}/v2/checkout/orders/${encodeURIComponent(orderId)}`;

    const response = await this.safeFetch(orderUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      throw await this.parsePayPalError(response, `PayPal get order ${orderId}`);
    }

    return (await response.json()) as PayPalOrderResponse;
  }

  /**
   * Server-side capture of an approved PayPal Sandbox order.
   */
  public async captureOrder(orderId: string): Promise<PayPalOrderResponse> {
    const token = await this.getAccessToken();
    const captureUrl = `${this.baseUrl}/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`;

    const response = await this.safeFetch(captureUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'PayPal-Request-Id': `pg_cap_${orderId}`,
      },
      body: JSON.stringify({}),
    });

    if (!response.ok) {
      throw await this.parsePayPalError(response, 'PayPal order capture');
    }

    let result: PayPalOrderResponse;
    try {
      result = (await response.json()) as PayPalOrderResponse;
    } catch {
      throw new Error('Malformed JSON received from PayPal order capture endpoint.');
    }

    return result;
  }
}

export const payPalService = new PayPalService();
