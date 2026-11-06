import { config } from '../config/env';
import { LLMService, llmService } from './llm.service';
import {
  DiscoveredProduct,
  DiscoveryResponse,
  ResultQualityTier,
  TavilySearchRequest,
  TavilySearchResponse,
  TavilySearchResultItem,
} from '../types/discovery.types';
import { ExtractedPurchaseIntent } from '../types/llm.types';

export type FetchFunction = typeof fetch;

/**
 * List of known news aggregators, PR newswires, market research publishers,
 * third-party review/comparison portals, and encyclopedia domains that must not
 * be identified as merchants or direct product sellers.
 */
export const NON_MERCHANT_DOMAINS: string[] = [
  'yahoo.com',
  'finance.yahoo.com',
  'news.yahoo.com',
  'prnewswire.com',
  'businesswire.com',
  'globenewswire.com',
  'valuates.com',
  'marketwatch.com',
  'bloomberg.com',
  'reuters.com',
  'forbes.com',
  'grandviewresearch.com',
  'marketsandmarkets.com',
  'verifiedmarketresearch.com',
  'technavio.com',
  'mordorintelligence.com',
  'techcrunch.com',
  'venturebeat.com',
  'medium.com',
  'wikipedia.org',
  'reddit.com',
  'quora.com',
  'investopedia.com',
  'fool.com',
  'cnbc.com',
  'wsj.com',
  'nytimes.com',
  'theverge.com',
  'zdnet.com',
  'wired.com',
  // Third-party comparison and review aggregator portals
  'comparevps.com',
  'hostadvice.com',
  'hostingadvice.com',
  'techradar.com',
  'pcmag.com',
  'tomsguide.com',
  'cnet.com',
  'trustpilot.com',
  'g2.com',
  'capterra.com',
  'softwareadvice.com',
  'getapp.com',
];

/**
 * Common regex signatures found in market research reports, press releases,
 * and news articles rather than official product or merchant pricing pages.
 */
export const RESEARCH_AND_PR_SIGNATURES: RegExp[] = [
  /\bmarket\s+size\b/i,
  /\bmarket\s+share\b/i,
  /\bmarket\s+research\b/i,
  /\bindustry\s+report\b/i,
  /\bcagr\s+of\b/i,
  /\bto\s+grow\s+usd\b/i,
  /\bforecast\s+to\s+20\d\d\b/i,
  /\bmarket\s+growth\b/i,
  /\bmarket\s+trends\b/i,
  /\blaunches\s+service\s+to\s+empower\b/i,
  /\bintroduces\s+.*combining\s+the\s+simplicity\b/i,
  /\bannounced\s+today\s+that\b/i,
  /\bpress\s+release\b/i,
];

export class DiscoveryServiceError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(params: {
    message: string;
    statusCode?: number;
    code?: string;
    details?: unknown;
  }) {
    super(params.message);
    this.name = 'DiscoveryServiceError';
    this.statusCode = params.statusCode || 500;
    this.code = params.code || 'DISCOVERY_SERVICE_ERROR';
    this.details = params.details;
  }
}

export class DiscoveryService {
  private readonly apiKey: string;
  private readonly apiUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchFn: FetchFunction;
  private readonly llm: LLMService;

  constructor(
    customFetch: FetchFunction = fetch,
    options?: {
      apiKey?: string;
      apiUrl?: string;
      timeoutMs?: number;
      llm?: LLMService;
    }
  ) {
    this.fetchFn = customFetch;
    this.apiKey = options?.apiKey !== undefined ? options.apiKey : config.tavilyApiKey;
    this.apiUrl = options?.apiUrl || 'https://api.tavily.com/search';
    this.timeoutMs = options?.timeoutMs || 15000;
    this.llm = options?.llm || llmService;
  }

  /**
   * Checks whether the Tavily API key is configured.
   */
  public isConfigured(): boolean {
    return Boolean(
      this.apiKey &&
      this.apiKey.trim().length > 0 &&
      !this.apiKey.includes('your_tavily_api_key')
    );
  }

  /**
   * Redacts any occurrence of the Tavily API key from strings.
   */
  private sanitize(text: string): string {
    if (!this.apiKey || this.apiKey.length < 5) return text;
    return text.split(this.apiKey).join('[REDACTED_TAVILY_KEY]');
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
        throw new DiscoveryServiceError({
          message: `Tavily search request timed out after ${this.timeoutMs}ms.`,
          statusCode: 504,
          code: 'DISCOVERY_TIMEOUT',
        });
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Extracts the registered root domain (e.g. 'yahoo.com' from 'finance.yahoo.com').
   */
  public getRegisteredDomain(domain: string): string {
    if (!domain) return '';
    const clean = domain.toLowerCase().replace(/^www\./, '');
    const parts = clean.split('.');
    if (parts.length <= 2) return clean;

    const multiPartTlds = ['co.uk', 'com.au', 'co.nz', 'co.jp', 'com.sg', 'org.uk'];
    const lastTwo = parts.slice(-2).join('.');
    if (multiPartTlds.includes(lastTwo) && parts.length >= 3) {
      return parts.slice(-3).join('.');
    }
    return parts.slice(-2).join('.');
  }

  /**
   * Checks whether a domain belongs to a news aggregator, PR wire,
   * market research publisher, or known non-merchant platform.
   */
  public isNonMerchantDomain(domain: string | null): boolean {
    if (!domain) return false;
    const clean = domain.toLowerCase().replace(/^www\./, '');
    const registered = this.getRegisteredDomain(clean);

    // Filter out dedicated affiliate blog and review domains
    const baseName = registered.split('.')[0] || '';
    if (
      baseName.includes('blog') ||
      baseName.includes('review') ||
      baseName.includes('compare') ||
      baseName.includes('coupon') ||
      baseName.includes('discount')
    ) {
      return true;
    }

    return NON_MERCHANT_DOMAINS.some(
      (blocked) => clean === blocked || clean.endsWith('.' + blocked) || registered === blocked
    );
  }

  /**
   * Checks whether a search result is news, PR, or market research
   * rather than a direct merchant or product offering.
   */
  public isNewsOrMarketResearch(domain: string | null, title: string, content: string): boolean {
    if (this.isNonMerchantDomain(domain)) return true;
    const combined = `${title} ${content}`;
    return RESEARCH_AND_PR_SIGNATURES.some((regex) => regex.test(combined));
  }

  /**
   * Classifies a search result URL and title into quality tiers:
   * 1: Official Pricing Page (/pricing, /plans, /rates, /buy, /order, /cost)
   * 2: Official Product Page (/vps, /servers, /solutions, /products, /cloud, /compute)
   * 3: Official Website / General Page
   * 4: Third-Party Comparison / Review / Blog (Deprioritized)
   */
  public classifyResultTier(url: string, title: string, domain?: string | null): ResultQualityTier {
    const urlLower = url.toLowerCase();
    const titleLower = title.toLowerCase();
    const domainLower = (domain || '').toLowerCase().replace(/^www\./, '');

    // 1. Check for Third-party comparison portals, affiliate blogs, or reviews (Tier 4 - Deprioritized)
    const isComparisonOrReview =
      domainLower.includes('blog') ||
      domainLower.includes('review') ||
      domainLower.includes('compare') ||
      domainLower.includes('guide') ||
      urlLower.includes('/blog') ||
      urlLower.includes('/reviews') ||
      urlLower.includes('/review') ||
      urlLower.includes('-review') ||
      urlLower.includes('-guide') ||
      urlLower.includes('-explained') ||
      urlLower.includes('/comparison') ||
      urlLower.includes('/compare') ||
      urlLower.includes('/vs') ||
      urlLower.includes('-vs-') ||
      urlLower.includes('/cheapest-') ||
      urlLower.includes('/best-') ||
      urlLower.includes('/top-') ||
      urlLower.includes('compare') ||
      /\b(?:comparison|compared|vs\.?|cheapest\s+\w+\s+providers|top\s+\d+|best\s+\w+\s+(?:for\s+)?20\d\d|sizing\s+guide|review|reviews|guide|explained|coupon|discount)\b/i.test(titleLower);

    if (isComparisonOrReview) {
      return ResultQualityTier.COMPARISON_REVIEW;
    }

    // 2. Check for Official Pricing Page (Tier 1 - Highest Priority)
    const isPricingPage =
      urlLower.includes('/pricing') ||
      urlLower.includes('/plans') ||
      urlLower.includes('/rates') ||
      urlLower.includes('/vps-cost') ||
      urlLower.includes('/cost') ||
      urlLower.includes('/buy') ||
      /\b(?:pricing|plans\s+and\s+pricing|vps\s+pricing|vps\s+plans|pricing\s+and\s+plans)\b/i.test(titleLower);

    if (isPricingPage) {
      return ResultQualityTier.OFFICIAL_PRICING;
    }

    // 3. Check for Official Product Page (Tier 2)
    const isProductPage =
      urlLower.includes('/vps') ||
      urlLower.includes('/servers') ||
      urlLower.includes('/solutions/') ||
      urlLower.includes('/products/') ||
      urlLower.includes('/hosting/') ||
      urlLower.includes('/cloud/') ||
      urlLower.includes('/compute') ||
      urlLower.includes('/droplets');

    if (isProductPage) {
      return ResultQualityTier.OFFICIAL_PRODUCT;
    }

    // 4. Default to Official Website / General Page (Tier 3)
    return ResultQualityTier.OFFICIAL_WEBSITE;
  }

  /**
   * Formulates a focused, high-precision search query from natural language user input.
   * If purchase intent extraction is available, leverages product & merchant terms
   * to target official provider pricing pages and avoid generic news releases.
   */
  public async formulateSearchQuery(
    message: string
  ): Promise<{ query: string; intent: ExtractedPurchaseIntent | null }> {
    let intent: ExtractedPurchaseIntent | null = null;

    try {
      if (this.llm.isConfigured()) {
        intent = await this.llm.extractPurchaseIntent(message);
      }
    } catch {
      // Intent extraction failure should not block discovery; proceed with fallback synthesis
      intent = null;
    }

    // Build targeted query for official pricing pages
    let query = '';
    if (intent && (intent.product || intent.merchant)) {
      if (intent.merchant) {
        query = `${intent.merchant} ${intent.product || ''} official pricing plans`.trim();
      } else {
        query = `${intent.product} official pricing plans`.trim();
      }
    } else {
      // Fallback keyword synthesis: strip common conversational prefix words
      const cleaned = message
        .replace(/^(?:find\s+me|i\s+need|i\s+want|looking\s+for|search\s+for|buy\s+a|buy)\s+/i, '')
        .replace(/[?!.]+$/, '')
        .trim();
      query = `${cleaned} official pricing plans`.trim();
    }

    return { query, intent };
  }

  /**
   * Sanitizes untrusted snippet text returned from external search results.
   * Strips HTML tags, script blocks, and limits length.
   */
  public sanitizeSnippet(rawContent: string): string {
    if (!rawContent || typeof rawContent !== 'string') return '';
    return rawContent
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 300);
  }

  /**
   * Extracts an unverified listed price if explicitly stated in retrieved content.
   *
   * Currencies supported:
   * - Singapore Dollar (S$, SGD) => SGD
   * - Indian Rupee (₹, INR, Rs., Rs) => INR
   * - Euro (€, EUR) => EUR
   * - British Pound (£, GBP) => GBP
   * - Explicit US Dollar (US$, USD) => USD
   * - Ambiguous generic '$' => currency is NULL unless the surrounding text
   *   explicitly establishes USD context (e.g. "USD", "US Dollar").
   *
   * NEVER hallucinates or verifies prices; strictly marks as unverified.
   */
  public extractUnverifiedListedPrice(
    text: string
  ): { price: number | null; currency: string | null } {
    if (!text || typeof text !== 'string') {
      return { price: null, currency: null };
    }

    const findPrice = (regex: RegExp): number | null => {
      const matches = text.matchAll(regex);
      for (const match of matches) {
        const rawNum = match[1] || match[2];
        if (rawNum) {
          const val = parseFloat(rawNum);
          if (Number.isFinite(val) && val > 0) {
            return Math.round(val * 100) / 100;
          }
        }
      }
      return null;
    };

    // 1. Singapore Dollar (S$ or SGD), ensuring no preceding letter like 'U' in 'US$'
    const sgdPrice = findPrice(/(?<![a-zA-Z])(?:S\$|SGD\s*)\s*(\d+(?:\.\d{1,2})?)|(\d+(?:\.\d{1,2})?)\s*SGD/gi);
    if (sgdPrice !== null) {
      return { price: sgdPrice, currency: 'SGD' };
    }

    // 2. Indian Rupee (₹, INR, Rs., or Rs)
    const inrPrice = findPrice(/(?:₹|INR\s*|Rs\.?\s*)\s*(\d+(?:\.\d{1,2})?)|(\d+(?:\.\d{1,2})?)\s*INR/gi);
    if (inrPrice !== null) {
      return { price: inrPrice, currency: 'INR' };
    }

    // 3. Euro (€ or EUR)
    const eurPrice = findPrice(/(?:€|EUR\s*)\s*(\d+(?:\.\d{1,2})?)|(\d+(?:\.\d{1,2})?)\s*EUR/gi);
    if (eurPrice !== null) {
      return { price: eurPrice, currency: 'EUR' };
    }

    // 4. British Pound (£ or GBP)
    const gbpPrice = findPrice(/(?:£|GBP\s*)\s*(\d+(?:\.\d{1,2})?)|(\d+(?:\.\d{1,2})?)\s*GBP/gi);
    if (gbpPrice !== null) {
      return { price: gbpPrice, currency: 'GBP' };
    }

    // 5. Explicit US Dollar (US$ or explicit "USD")
    const explicitUsdPrice = findPrice(/(?<![a-zA-Z])(?:US\$|USD\s*)\s*(\d+(?:\.\d{1,2})?)|(\d+(?:\.\d{1,2})?)\s*USD/gi);
    if (explicitUsdPrice !== null) {
      return { price: explicitUsdPrice, currency: 'USD' };
    }

    // 6. Generic Dollar sign '$' without regional prefix
    // (Ensure it is not preceded by a letter like S, A, C, N, H, U)
    const genericDollarPrice = findPrice(/(?<![a-zA-Z])\$\s*(\d+(?:\.\d{1,2})?)/g);
    if (genericDollarPrice !== null) {
      // Ambiguous $10 => currency null unless context establishes USD
      const hasUsdContext = /\b(?:USD|US\s*Dollars?|United\s+States\s+Dollars?|U\.S\.\s*Dollars?)\b/i.test(text);
      return {
        price: genericDollarPrice,
        currency: hasUsdContext ? 'USD' : null,
      };
    }

    return { price: null, currency: null };
  }

  /**
   * Validates and normalizes URLs from search results.
   * Enforces strict http/https protocols; rejects javascript:, data:, file:, etc.
   */
  public validateUrl(rawUrl: string): { valid: boolean; url: string; domain: string | null } {
    try {
      const parsed = new URL(rawUrl);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return { valid: false, url: '', domain: null };
      }
      const domain = parsed.hostname.toLowerCase().replace(/^www\./, '');
      return { valid: true, url: parsed.toString(), domain };
    } catch {
      return { valid: false, url: '', domain: null };
    }
  }

  /**
   * Derives a readable merchant name from a domain or search title.
   * Guarantees news publishers, PR wires, and aggregators return null.
   */
  public deriveMerchantName(domain: string | null, title: string): string | null {
    if (!domain) return null;

    // News/PR/aggregator domains must NEVER be derived as merchants
    if (this.isNonMerchantDomain(domain)) {
      return null;
    }

    const domainLower = domain.toLowerCase().replace(/^www\./, '');
    const registered = this.getRegisteredDomain(domainLower);

    // Common brand overrides mapped by registered domain or specific service
    if (registered.includes('github.com')) return 'GitHub';
    if (registered.includes('figma.com')) return 'Figma';
    if (registered.includes('digitalocean.com')) return 'DigitalOcean';
    if (registered.includes('linode.com')) return 'Linode';
    if (registered.includes('vultr.com')) return 'Vultr';
    if (registered.includes('contabo.com')) return 'Contabo';
    if (registered.includes('hetzner.com')) return 'Hetzner';
    if (registered.includes('ionos.com')) return 'IONOS';
    if (registered.includes('liquidweb.com')) return 'Liquid Web';
    if (registered.includes('atlantic.net')) return 'Atlantic.Net';
    if (registered.includes('readyspace.com')) return 'ReadySpace';
    if (registered.includes('ovhcloud.com') || registered.includes('ovh.com')) return 'OVHcloud';
    if (registered.includes('scaleway.com')) return 'Scaleway';
    if (domainLower.includes('aws.amazon.com') || registered.includes('amazon.com')) return 'AWS';
    if (registered.includes('cloudflare.com')) return 'Cloudflare';
    if (registered.includes('namecheap.com')) return 'Namecheap';
    if (registered.includes('hostinger.com')) return 'Hostinger';

    // Derive name from registered domain base
    const baseName = registered.split('.')[0] || '';
    if (baseName.length > 1) {
      return baseName.charAt(0).toUpperCase() + baseName.slice(1);
    }

    return title ? title.split(/[-|:]/)[0].trim() : null;
  }

  /**
   * Performs end-to-end product and merchant discovery using Tavily Web Search.
   *
   * Results are categorized and prioritized:
   * 1. Official Provider Pricing Pages (Tier 1)
   * 2. Official Provider Product Pages (Tier 2)
   * 3. Official Provider Websites (Tier 3)
   * 4. Third-Party Comparison Articles & Reviews (Tier 4 - Deprioritized)
   *
   * @param message Natural language product/service request
   * @param maxResults Maximum results to return (1-10, default 5)
   * @returns Structured discovery response with validated products and unverified prices
   */
  public async discoverProducts(
    message: string,
    maxResults: number = 5
  ): Promise<DiscoveryResponse> {
    // 1. Validate user input
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      throw new DiscoveryServiceError({
        message: 'Discovery request message is required and cannot be empty.',
        statusCode: 400,
        code: 'VALIDATION_FAILED',
      });
    }

    // 2. Validate configuration
    if (!this.isConfigured()) {
      throw new DiscoveryServiceError({
        message: 'Tavily Search API key is not configured. Set TAVILY_API_KEY in backend/.env',
        statusCode: 503,
        code: 'DISCOVERY_NOT_CONFIGURED',
      });
    }

    // 3. Clamp maxResults
    const clampedLimit = Math.max(1, Math.min(10, Math.floor(maxResults || 5)));

    // 4. Formulate focused query & extract intent
    const { query, intent } = await this.formulateSearchQuery(message.trim());

    // 5. Execute Tavily search with domain exclusions
    const payload: TavilySearchRequest = {
      api_key: this.apiKey,
      query,
      search_depth: 'basic',
      include_answer: false,
      max_results: Math.min(10, Math.max(1, clampedLimit + 5)),
      exclude_domains: NON_MERCHANT_DOMAINS,
    };

    let response: Response;
    try {
      response = await this.safeFetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(payload),
      });
    } catch (err: unknown) {
      if (err instanceof DiscoveryServiceError) {
        throw err;
      }
      const rawMessage = err instanceof Error ? err.message : 'Network error communicating with Tavily API';
      throw new DiscoveryServiceError({
        message: this.sanitize(rawMessage),
        statusCode: 502,
        code: 'DISCOVERY_NETWORK_ERROR',
      });
    }

    // 6. Handle HTTP status errors
    if (!response.ok) {
      if (response.status === 401) {
        throw new DiscoveryServiceError({
          message: 'Tavily authentication failed: Invalid or expired API key.',
          statusCode: 401,
          code: 'DISCOVERY_AUTH_FAILED',
        });
      }

      if (response.status === 429) {
        throw new DiscoveryServiceError({
          message: 'Tavily rate limit exceeded (HTTP 429). Please retry shortly.',
          statusCode: 429,
          code: 'DISCOVERY_RATE_LIMITED',
        });
      }

      let errorDetail = '';
      try {
        const errorJson = (await response.json()) as any;
        errorDetail = errorJson?.error || errorJson?.message || '';
      } catch {
        errorDetail = await response.text().catch(() => '');
      }

      const sanitizedDetail = this.sanitize(errorDetail);
      throw new DiscoveryServiceError({
        message: sanitizedDetail
          ? `Tavily API error (HTTP ${response.status}): ${sanitizedDetail}`
          : `Tavily API request failed with HTTP ${response.status}.`,
        statusCode: response.status >= 400 && response.status < 600 ? response.status : 502,
        code: 'DISCOVERY_UPSTREAM_ERROR',
      });
    }

    // 7. Parse JSON response
    let data: TavilySearchResponse;
    try {
      data = (await response.json()) as TavilySearchResponse;
    } catch {
      throw new DiscoveryServiceError({
        message: 'Malformed JSON received from Tavily API response.',
        statusCode: 502,
        code: 'DISCOVERY_MALFORMED_RESPONSE',
      });
    }

    if (!Array.isArray(data?.results)) {
      throw new DiscoveryServiceError({
        message: 'Tavily response missing valid results array.',
        statusCode: 502,
        code: 'DISCOVERY_MALFORMED_RESPONSE',
      });
    }

    // 8. Normalize, classify, and filter candidate results
    interface ScoredCandidate {
      product: DiscoveredProduct;
      tier: ResultQualityTier;
      rawScore: number;
    }

    const candidates: ScoredCandidate[] = [];

    for (const item of data.results) {
      // Validate URL scheme
      const { valid, url, domain } = this.validateUrl(item.url);
      if (!valid || !domain) continue;

      // Filter out news articles, PR wires, and market research reports
      if (this.isNewsOrMarketResearch(domain, item.title, item.content)) {
        continue;
      }

      const title = (item.title || domain).trim().slice(0, 150);
      const description = this.sanitizeSnippet(item.content || '');
      const merchantName = this.deriveMerchantName(domain, title);

      // Extract unverified listed price from snippet or title
      const priceText = `${title} ${description}`;
      const { price, currency } = this.extractUnverifiedListedPrice(priceText);

      // Classify page quality tier
      const tier = this.classifyResultTier(url, title, domain);

      // Compute normalized relevance score reflecting page tier
      const rawScore = typeof item.score === 'number' && Number.isFinite(item.score)
        ? Math.max(0, Math.min(1, item.score))
        : 0.80;

      let adjustedScore = rawScore;
      if (tier === ResultQualityTier.OFFICIAL_PRICING) {
        adjustedScore = Math.min(0.99, Math.max(0.90, rawScore));
      } else if (tier === ResultQualityTier.OFFICIAL_PRODUCT) {
        adjustedScore = Math.min(0.89, Math.max(0.80, rawScore * 0.95));
      } else if (tier === ResultQualityTier.OFFICIAL_WEBSITE) {
        adjustedScore = Math.min(0.79, Math.max(0.70, rawScore * 0.85));
      } else {
        // Deprioritized comparison or review article
        adjustedScore = Math.min(0.65, rawScore * 0.65);
      }

      const relevanceScore = Math.round(adjustedScore * 100) / 100;

      candidates.push({
        product: {
          title,
          sourceUrl: url,
          merchantName,
          merchantDomain: domain,
          description,
          relevanceScore,
          unverifiedListedPrice: price,
          currency,
        },
        tier,
        rawScore,
      });
    }

    // 9. Sort candidates: Quality Tier ascending (Tier 1 > Tier 2 > Tier 3 > Tier 4), then relevance descending
    candidates.sort((a, b) => {
      if (a.tier !== b.tier) {
        return a.tier - b.tier;
      }
      return b.product.relevanceScore - a.product.relevanceScore;
    });

    const results = candidates.slice(0, clampedLimit).map((c) => c.product);

    return {
      query,
      extractedIntent: intent,
      resultsCount: results.length,
      results,
    };
  }
}

export const discoveryService = new DiscoveryService();
