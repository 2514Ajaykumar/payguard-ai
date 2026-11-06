import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DiscoveryService, DiscoveryServiceError, FetchFunction } from '../services/discovery.service';
import { AgentController } from '../controllers/agent.controller';
import { LLMService } from '../services/llm.service';

describe('Phase 4.3: Merchant and Product Discovery Tests (Mocked Tavily API)', () => {
  const MOCK_TAVILY_KEY = 'tvly-mock-secret-key-1234567890abcdef';

  const createMockFetch = (
    handler: (url: string, init?: RequestInit) => Promise<Response>
  ): FetchFunction => {
    return async (input: string | URL | any, init?: RequestInit): Promise<Response> => {
      const url = input.toString();
      return handler(url, init);
    };
  };

  describe('1. Discovery Service Core Operations', () => {
    it('successfully discovers products from valid Tavily search response', async () => {
      let capturedBody: any = null;

      const mockFetch = createMockFetch(async (_url, init) => {
        capturedBody = JSON.parse((init?.body as string) || '{}');
        return new Response(
          JSON.stringify({
            query: 'VPS providers official plans pricing',
            results: [
              {
                title: 'DigitalOcean: Cloud Hosting & Droplets',
                url: 'https://www.digitalocean.com/pricing/droplets',
                content: 'Simple, scalable virtual machines starting at $4/mo USD with predictable pricing and SSD storage.',
                score: 0.96,
              },
              {
                title: 'Linode Cloud Instances',
                url: 'https://www.linode.com/pricing',
                content: 'High-performance SSD Linux servers starting at $5 per month USD across global datacenters.',
                score: 0.91,
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      });

      const service = new DiscoveryService(mockFetch, { apiKey: MOCK_TAVILY_KEY });
      const response = await service.discoverProducts('Find me a cheap VPS', 5);

      assert.equal(capturedBody.api_key, MOCK_TAVILY_KEY);
      assert.ok(Array.isArray(capturedBody.exclude_domains), 'exclude_domains must be passed');
      assert.equal(response.resultsCount, 2);
      assert.equal(response.results.length, 2);

      const first = response.results[0];
      assert.equal(first.merchantName, 'DigitalOcean');
      assert.equal(first.merchantDomain, 'digitalocean.com');
      assert.equal(first.sourceUrl, 'https://www.digitalocean.com/pricing/droplets');
      assert.equal(first.unverifiedListedPrice, 4.00);
      assert.equal(first.currency, 'USD');
      assert.equal(first.relevanceScore, 0.96);

      const second = response.results[1];
      assert.equal(second.merchantName, 'Linode');
      assert.equal(second.merchantDomain, 'linode.com');
      assert.equal(second.unverifiedListedPrice, 5.00);
      assert.equal(second.currency, 'USD');
    });

    it('sets unverifiedListedPrice to null when no price is stated in content', async () => {
      const mockFetch = createMockFetch(async () => {
        return new Response(
          JSON.stringify({
            results: [
              {
                title: 'GitHub Copilot Enterprise Features',
                url: 'https://github.com/features/copilot',
                content: 'Empower your development team with AI-powered code suggestions and security analysis.',
                score: 0.88,
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      });

      const service = new DiscoveryService(mockFetch, { apiKey: MOCK_TAVILY_KEY });
      const response = await service.discoverProducts('GitHub Copilot enterprise', 1);

      assert.equal(response.results.length, 1);
      assert.equal(response.results[0].unverifiedListedPrice, null);
      assert.equal(response.results[0].currency, null);
      assert.equal(response.results[0].merchantName, 'GitHub');
    });

    it('rejects unsafe URL schemes like javascript: or file: without including them in results', async () => {
      const mockFetch = createMockFetch(async () => {
        return new Response(
          JSON.stringify({
            results: [
              {
                title: 'Malicious Exploit Page',
                url: 'javascript:alert(document.cookie)',
                content: 'Unsafe script url should be completely rejected',
                score: 0.99,
              },
              {
                title: 'Local File Scheme Leak',
                url: 'file:///etc/passwd',
                content: 'Unsafe file url should be completely rejected',
                score: 0.95,
              },
              {
                title: 'Legitimate Cloudflare Pricing',
                url: 'https://www.cloudflare.com/plans',
                content: 'Cloudflare Pro plan starts at $20/mo USD',
                score: 0.85,
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      });

      const service = new DiscoveryService(mockFetch, { apiKey: MOCK_TAVILY_KEY });
      const response = await service.discoverProducts('Cloudflare plans', 5);

      assert.equal(response.results.length, 1);
      assert.equal(response.results[0].merchantDomain, 'cloudflare.com');
      assert.equal(response.results[0].sourceUrl, 'https://www.cloudflare.com/plans');
      assert.equal(response.results[0].unverifiedListedPrice, 20.00);
      assert.equal(response.results[0].currency, 'USD');
    });

    it('sanitizes untrusted HTML and script tags from search snippet content', async () => {
      const mockFetch = createMockFetch(async () => {
        return new Response(
          JSON.stringify({
            results: [
              {
                title: 'Hosting Deal',
                url: 'https://hostinger.com/pricing',
                content: 'Special offer <script>alert("hacked")</script> <b>Web hosting</b> at $2.99 per month USD.',
                score: 0.92,
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      });

      const service = new DiscoveryService(mockFetch, { apiKey: MOCK_TAVILY_KEY });
      const response = await service.discoverProducts('hostinger hosting', 1);

      assert.equal(response.results.length, 1);
      assert.doesNotMatch(response.results[0].description, /<script>/i);
      assert.doesNotMatch(response.results[0].description, /<\/script>/i);
      assert.doesNotMatch(response.results[0].description, /<b>/i);
      assert.match(response.results[0].description, /Web hosting at \$2\.99 per month/);
      assert.equal(response.results[0].unverifiedListedPrice, 2.99);
      assert.equal(response.results[0].currency, 'USD');
    });

    it('clamps maxResults between 1 and 10', async () => {
      let requestedMax = 0;
      const mockFetch = createMockFetch(async (_url, init) => {
        const body = JSON.parse((init?.body as string) || '{}');
        requestedMax = body.max_results;
        return new Response(JSON.stringify({ results: [] }), { status: 200 });
      });

      const service = new DiscoveryService(mockFetch, { apiKey: MOCK_TAVILY_KEY });

      await service.discoverProducts('test query', 50);
      // With +5 buffer, clamped limit 10 produces max_results 10
      assert.equal(requestedMax, 10, 'Should clamp upper bound to 10');

      await service.discoverProducts('test query', -5);
      // Clamped limit 1 + 5 buffer = 6
      assert.equal(requestedMax, 6, 'Should clamp lower bound to 1 (+ buffer)');
    });

    it('throws 503 when Tavily API key is not configured', async () => {
      const service = new DiscoveryService(fetch, { apiKey: '' });

      await assert.rejects(
        async () => {
          await service.discoverProducts('Cheap VPS');
        },
        (err: unknown) => {
          assert(err instanceof DiscoveryServiceError);
          assert.equal(err.code, 'DISCOVERY_NOT_CONFIGURED');
          assert.equal(err.statusCode, 503);
          return true;
        }
      );
    });

    it('handles Tavily 401 Unauthorized without leaking secrets', async () => {
      const mockFetch = createMockFetch(async () => {
        return new Response(
          JSON.stringify({ error: `Unauthorized with key ${MOCK_TAVILY_KEY}` }),
          { status: 401, headers: { 'Content-Type': 'application/json' } }
        );
      });

      const service = new DiscoveryService(mockFetch, { apiKey: MOCK_TAVILY_KEY });

      await assert.rejects(
        async () => {
          await service.discoverProducts('Cheap VPS');
        },
        (err: unknown) => {
          assert(err instanceof DiscoveryServiceError);
          assert.equal(err.code, 'DISCOVERY_AUTH_FAILED');
          assert.equal(err.statusCode, 401);
          assert.doesNotMatch(err.message, new RegExp(MOCK_TAVILY_KEY));
          return true;
        }
      );
    });

    it('handles Tavily 429 Rate Limit error gracefully', async () => {
      const mockFetch = createMockFetch(async () => {
        return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), {
          status: 429,
          headers: { 'Content-Type': 'application/json' },
        });
      });

      const service = new DiscoveryService(mockFetch, { apiKey: MOCK_TAVILY_KEY });

      await assert.rejects(
        async () => {
          await service.discoverProducts('Cheap VPS');
        },
        (err: unknown) => {
          assert(err instanceof DiscoveryServiceError);
          assert.equal(err.code, 'DISCOVERY_RATE_LIMITED');
          assert.equal(err.statusCode, 429);
          return true;
        }
      );
    });

    it('handles Tavily 500 server error without exposing internal details', async () => {
      const mockFetch = createMockFetch(async () => {
        return new Response(JSON.stringify({ error: 'Internal cluster failure' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      });

      const service = new DiscoveryService(mockFetch, { apiKey: MOCK_TAVILY_KEY });

      await assert.rejects(
        async () => {
          await service.discoverProducts('Cheap VPS');
        },
        (err: unknown) => {
          assert(err instanceof DiscoveryServiceError);
          assert.equal(err.code, 'DISCOVERY_UPSTREAM_ERROR');
          assert.equal(err.statusCode, 500);
          return true;
        }
      );
    });

    it('handles search timeout safely using AbortController', async () => {
      const mockFetch = createMockFetch(async (_url, init) => {
        const signal = init?.signal;
        return new Promise<Response>((_resolve, reject) => {
          if (signal) {
            signal.addEventListener('abort', () => {
              const abortErr = new Error('The operation was aborted');
              abortErr.name = 'AbortError';
              reject(abortErr);
            });
          }
        });
      });

      const service = new DiscoveryService(mockFetch, {
        apiKey: MOCK_TAVILY_KEY,
        timeoutMs: 30,
      });

      await assert.rejects(
        async () => {
          await service.discoverProducts('Cheap VPS');
        },
        (err: unknown) => {
          assert(err instanceof DiscoveryServiceError);
          assert.equal(err.code, 'DISCOVERY_TIMEOUT');
          assert.equal(err.statusCode, 504);
          assert.match(err.message, /timed out/i);
          return true;
        }
      );
    });

    it('handles malformed JSON from Tavily API safely', async () => {
      const mockFetch = createMockFetch(async () => {
        return new Response('<html>502 Bad Gateway</html>', {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        });
      });

      const service = new DiscoveryService(mockFetch, { apiKey: MOCK_TAVILY_KEY });

      await assert.rejects(
        async () => {
          await service.discoverProducts('Cheap VPS');
        },
        (err: unknown) => {
          assert(err instanceof DiscoveryServiceError);
          assert.equal(err.code, 'DISCOVERY_MALFORMED_RESPONSE');
          assert.equal(err.statusCode, 502);
          return true;
        }
      );
    });
  });

  describe('2. Regression Tests: Currency Precision, Non-Merchant Filtering & Search Targeting', () => {
    it('correctly extracts Singapore Dollar price and currency as SGD from S$5/month', () => {
      const service = new DiscoveryService();

      const res1 = service.extractUnverifiedListedPrice(
        'The new VPS hosting service is available with per-hour billing starting at S$0.00694/hour (approximately S$5/month).'
      );
      assert.equal(res1.price, 5.00);
      assert.equal(res1.currency, 'SGD', 'S$5/month must be parsed as SGD, not USD');

      const res2 = service.extractUnverifiedListedPrice(
        'Dedicated server hosting plans start at 25 SGD per month for Singapore cloud instances.'
      );
      assert.equal(res2.price, 25.00);
      assert.equal(res2.currency, 'SGD');
    });

    it('correctly extracts Indian Rupee price and currency as INR from ₹500/month', () => {
      const service = new DiscoveryService();

      const res1 = service.extractUnverifiedListedPrice(
        'Deploy fast SSD cloud VPS in Mumbai datacenter starting at ₹500/month.'
      );
      assert.equal(res1.price, 500.00);
      assert.equal(res1.currency, 'INR', '₹500/month must be parsed as INR');

      const res2 = service.extractUnverifiedListedPrice(
        'Affordable cPanel shared hosting starting at INR 199 per month.'
      );
      assert.equal(res2.price, 199.00);
      assert.equal(res2.currency, 'INR');

      const res3 = service.extractUnverifiedListedPrice(
        'Cloud instances at Rs. 450 per month.'
      );
      assert.equal(res3.price, 450.00);
      assert.equal(res3.currency, 'INR');
    });

    it('correctly extracts Euro price and currency as EUR from €10/month', () => {
      const service = new DiscoveryService();

      const res1 = service.extractUnverifiedListedPrice(
        'Frankfurt NVMe VPS available starting at €10/month with unmetered bandwidth.'
      );
      assert.equal(res1.price, 10.00);
      assert.equal(res1.currency, 'EUR', '€10/month must be parsed as EUR');

      const res2 = service.extractUnverifiedListedPrice(
        'Managed Kubernetes cluster starting from 49.99 EUR monthly.'
      );
      assert.equal(res2.price, 49.99);
      assert.equal(res2.currency, 'EUR');
    });

    it('returns currency as null for ambiguous $10 unless surrounding context establishes USD', () => {
      const service = new DiscoveryService();

      // Ambiguous: generic $10 with NO surrounding USD context
      const ambiguous = service.extractUnverifiedListedPrice(
        'High-performance cloud servers starting at $10/month with 2GB RAM.'
      );
      assert.equal(ambiguous.price, 10.00);
      assert.equal(ambiguous.currency, null, 'Ambiguous $10 without USD context must return currency: null');

      // Unambiguous: text explicitly mentions USD or US Dollars
      const unambiguousContext = service.extractUnverifiedListedPrice(
        'High-performance cloud servers starting at $10/month USD with 2GB RAM.'
      );
      assert.equal(unambiguousContext.price, 10.00);
      assert.equal(unambiguousContext.currency, 'USD');

      const unambiguousWords = service.extractUnverifiedListedPrice(
        'Pricing starts at $15 per month. All rates are listed in US Dollars.'
      );
      assert.equal(unambiguousWords.price, 15.00);
      assert.equal(unambiguousWords.currency, 'USD');

      const unambiguousPrefix = service.extractUnverifiedListedPrice(
        'VPS hosting tier at US$20/mo with unlimited traffic.'
      );
      assert.equal(unambiguousPrefix.price, 20.00);
      assert.equal(unambiguousPrefix.currency, 'USD');
    });

    it('guarantees Yahoo Finance and news sites never become the merchantName', () => {
      const service = new DiscoveryService();

      // Yahoo Finance reporting on an external VPS provider
      const yahooMerchant = service.deriveMerchantName(
        'finance.yahoo.com',
        'Ready Server Launches VPS Hosting Service to Empower Growth'
      );
      assert.equal(yahooMerchant, null, 'Yahoo Finance domain must return null as merchantName');

      const reutersMerchant = service.deriveMerchantName(
        'reuters.com',
        'Tech Industry Update: Cloud Computing Trends'
      );
      assert.equal(reutersMerchant, null, 'Reuters must return null as merchantName');

      const prMerchant = service.deriveMerchantName(
        'prnewswire.com',
        'Company Launches Next-Gen VPS Platform'
      );
      assert.equal(prMerchant, null, 'PRNewswire must return null as merchantName');
    });

    it('filters out news articles and market research reports from discovery results', async () => {
      let excludeDomainsPassed: string[] = [];

      const mockFetch = createMockFetch(async (_url, init) => {
        const body = JSON.parse((init?.body as string) || '{}');
        excludeDomainsPassed = body.exclude_domains || [];

        return new Response(
          JSON.stringify({
            results: [
              {
                title: 'Ready Server Launches VPS Hosting Service to Empower Growth of Businesses in Singapore',
                url: 'https://finance.yahoo.com/news/ready-server-launches-vps-hosting-020000191.html',
                content: 'Flexible and Transparent Pricing starting at S$5/month...',
                score: 0.95,
              },
              {
                title: 'Virtual Private Servers (VPS) Hosting Market Size to Grow USD 1346.3 Million by 2030 at a CAGR of 9% | Valuates Reports',
                url: 'https://valuates.com/reports/virtual-private-servers-vps-hosting-market',
                content: 'Cloud-based VPS solutions are a major force driving growth in the VPS market size to grow USD 1346.3 Million...',
                score: 0.90,
              },
              {
                title: 'VPS Hosting Plans - Starting at $4/mo | DigitalOcean',
                url: 'https://www.digitalocean.com/solutions/vps-hosting',
                content: 'Simple, scalable virtual machines starting at $4/mo USD with predictable pricing.',
                score: 0.88,
              },
              {
                title: 'The Best Value Cloud VPS On Earth',
                url: 'https://contabo.com/en/vps',
                content: 'High-performance cloud VPS instances starting from €4.50 per month.',
                score: 0.85,
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      });

      const service = new DiscoveryService(mockFetch, { apiKey: MOCK_TAVILY_KEY });
      const response = await service.discoverProducts('cloud VPS hosting providers', 5);

      // Verify exclude_domains was sent to Tavily
      assert.ok(excludeDomainsPassed.includes('finance.yahoo.com') || excludeDomainsPassed.includes('yahoo.com'));
      assert.ok(excludeDomainsPassed.includes('valuates.com'));

      // Verify news article and market research report were filtered out
      assert.equal(response.results.length, 2, 'Only genuine merchant products should be returned');

      const first = response.results[0];
      assert.equal(first.merchantName, 'DigitalOcean');
      assert.equal(first.merchantDomain, 'digitalocean.com');
      assert.equal(first.unverifiedListedPrice, 4.00);
      assert.equal(first.currency, 'USD');

      const second = response.results[1];
      assert.equal(second.merchantName, 'Contabo');
      assert.equal(second.merchantDomain, 'contabo.com');
      assert.equal(second.unverifiedListedPrice, 4.50);
      assert.equal(second.currency, 'EUR');
    });

    it('proves official provider pages rank ahead of comparison articles and reviews when both are available', async () => {
      const mockFetch = createMockFetch(async () => {
        return new Response(
          JSON.stringify({
            results: [
              {
                title: 'Best VPS Hosting Price Comparison (May 2026) - SSD Nodes',
                url: 'https://www.ssdnodes.com/blog/vps-hosting-price-comparison',
                content: 'We compare prices across providers. Starting at $3.50/mo USD.',
                score: 0.98, // High raw search score, but Tier 4 comparison blog
              },
              {
                title: 'Best Cloud VPS Hosting 2026: Providers Compared & Sizing Guide',
                url: 'https://vps.us/blog/best-cloud-vps-hosting-top-solutions',
                content: 'Review and comparison guide for cloud VPS starting at $5/mo USD.',
                score: 0.95, // High raw search score, but Tier 4 comparison blog
              },
              {
                title: 'VPS Hosting Pricing and Plans - Atlantic.Net',
                url: 'https://www.atlantic.net/vps-hosting/pricing',
                content: 'High-performance cloud VPS plans and pricing starting at $19.94 per month USD.',
                score: 0.82, // Moderate raw search score, but Tier 1 Official Pricing page
              },
              {
                title: 'VPS Hosting | Virtual Private Servers | Starting at $4/month',
                url: 'https://www.ionos.com/servers/vps',
                content: 'Virtual Private Servers starting at $4/month USD with NVMe storage.',
                score: 0.80, // Moderate raw search score, but Tier 2 Official Product page
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      });

      const service = new DiscoveryService(mockFetch, { apiKey: MOCK_TAVILY_KEY });
      const response = await service.discoverProducts('cloud VPS hosting', 2);

      // Verify that the 2 returned results are official provider pages, NOT the comparison articles
      assert.equal(response.results.length, 2);

      // Result #1: Atlantic.Net (Tier 1 - Official Pricing Page) ranks ahead despite lower raw search score
      assert.equal(response.results[0].merchantName, 'Atlantic.Net');
      assert.equal(response.results[0].sourceUrl, 'https://www.atlantic.net/vps-hosting/pricing');
      assert.equal(response.results[0].unverifiedListedPrice, 19.94);
      assert.equal(response.results[0].currency, 'USD');

      // Result #2: IONOS (Tier 2 - Official Product Page) ranks ahead of the comparison articles
      assert.equal(response.results[1].merchantName, 'IONOS');
      assert.equal(response.results[1].sourceUrl, 'https://www.ionos.com/servers/vps');
      assert.equal(response.results[1].unverifiedListedPrice, 4.00);
      assert.equal(response.results[1].currency, 'USD');
    });
  });

  describe('3. Agent Controller /discover HTTP Handler Tests', () => {
    it('returns 200 with discovery results for valid request', async () => {
      const mockFetch = createMockFetch(async () => {
        return new Response(
          JSON.stringify({
            results: [
              {
                title: 'Vultr Cloud Compute',
                url: 'https://vultr.com/pricing',
                content: 'Deploy cloud SSD instances starting at $2.50 per month USD worldwide.',
                score: 0.94,
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      });

      const discovery = new DiscoveryService(mockFetch, { apiKey: MOCK_TAVILY_KEY });
      const controller = new AgentController(new LLMService(), discovery);

      let statusCode = 0;
      let responseBody: any = null;

      const mockReq: any = {
        body: {
          message: 'Find me a cheap VPS',
          maxResults: 3,
        },
      };

      const mockRes: any = {
        status: (code: number) => {
          statusCode = code;
          return mockRes;
        },
        json: (data: any) => {
          responseBody = data;
          return mockRes;
        },
      };

      await controller.discover(mockReq, mockRes, () => {});

      assert.equal(statusCode, 200);
      assert.equal(responseBody.success, true);
      assert.equal(responseBody.data.resultsCount, 1);
      assert.equal(responseBody.data.results[0].merchantName, 'Vultr');
      assert.equal(responseBody.data.results[0].unverifiedListedPrice, 2.50);
      assert.equal(responseBody.data.results[0].currency, 'USD');
    });

    it('returns 400 when message is missing or empty in discover', async () => {
      const discovery = new DiscoveryService(fetch, { apiKey: MOCK_TAVILY_KEY });
      const controller = new AgentController(new LLMService(), discovery);

      for (const badBody of [{}, { message: '' }, { message: '   ' }, { message: 123 }]) {
        let statusCode = 0;
        let responseBody: any = null;

        const mockReq: any = { body: badBody };
        const mockRes: any = {
          status: (code: number) => {
            statusCode = code;
            return mockRes;
          },
          json: (data: any) => {
            responseBody = data;
            return mockRes;
          },
        };

        await controller.discover(mockReq, mockRes, () => {});

        assert.equal(statusCode, 400);
        assert.equal(responseBody.success, false);
        assert.equal(responseBody.error.code, 'INVALID_REQUEST');
      }
    });

    it('forwards discovery service errors to next() without exposing API keys', async () => {
      const mockFetch = createMockFetch(async () => {
        return new Response(JSON.stringify({ error: `Unauthorized with key ${MOCK_TAVILY_KEY}` }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });
      });

      const discovery = new DiscoveryService(mockFetch, { apiKey: MOCK_TAVILY_KEY });
      const controller = new AgentController(new LLMService(), discovery);

      let passedError: any = null;
      const mockReq: any = { body: { message: 'Find me cloud servers' } };
      const mockRes: any = { status: () => mockRes, json: () => mockRes };
      const mockNext = (err: any) => {
        passedError = err;
      };

      await controller.discover(mockReq, mockRes, mockNext);

      assert.ok(passedError, 'Error should be forwarded to next()');
      assert.equal(passedError.code, 'DISCOVERY_AUTH_FAILED');
      assert.equal(passedError.statusCode, 401);
      assert.doesNotMatch(passedError.message, new RegExp(MOCK_TAVILY_KEY));
    });
  });
});
