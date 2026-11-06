# PayGuard AI — System Architecture (Phase 4.3: Merchant and Product Discovery)

**Trust Before the Transaction** — Pre-transaction AI Guardrails, Policy Enforcement, PayPal Sandbox Payments, Natural Language Intent & Web Product Discovery.

## Executive Overview

Autonomous AI agents (procurement bots, devops automations, customer service agents) are increasingly tasked with spending real capital. However, connecting an autonomous agent directly to a payment processor introduces immense risk:
1. Prompt injection leading to rogue transactions
2. Hallucinated spending amounts or duplicated subscriptions
3. Invoice splitting to circumvent single-transaction limits
4. Malicious merchant redirects and untrusted top-level domains

**PayGuard AI** acts as an authoritative, backend-owned verification layer **before** any transaction touches PayPal payment rails. It intercepts agent intentions, evaluates them against deterministic corporate policies, checks user budget limits, issues an authoritative decision, and orchestrates PayPal Orders API checkout in Sandbox mode.

```
┌─────────────────────────────────┐
│   Autonomous Agent Intent       │  (e.g., "Renew Cloud GPU cluster $1,450")
└────────────────┬────────────────┘
                 │
                 ▼
┌───────────────────────────────────────────┐
│    PayGuard Authorization Engine (Backend)│
│       POST /api/authorization/evaluate    │
├───────────────────────────────────────────┤
│ 1. Structural & Identity Validation       │
│ 2. Amount & Finite Positivity Verification│
│ 3. Supported Currency Allowlist           │
│ 4. Prohibited Merchant Categories         │
│ 5. Domain Reputation & Restricted TLDs    │
│ 6. Stated User Budget Cap Enforcement     │
│ 7. Multi-Tier Amount Threshold Evaluation │
└─────────────────────┬─────────────────────┘
                      │
        ┌─────────────┼─────────────┐
        ▼             ▼             ▼
   [APPROVED]  [REVIEW_REQUIRED] [BLOCKED]
  canProceed:     canProceed:    canProceed:
     true            false          false
        │             │             │
        ▼             ▼             ▼
┌───────────────┐ ┌───────────────┐ ┌───────────────┐
│ Eligible for  │ │ Suspended:    │ │ Zero-Touch    │
│ PayPal Orders │ │ Human Review  │ │ Rejection;    │
│ Sandbox (Ph3) │ │ Required (Ph2)│ │ Payment Halted│
└───────┬───────┘ └───────────────┘ └───────────────┘
        │
        ▼
┌──────────────────────────────────────────────────┐
│   PayPal Sandbox Checkout Orchestration (Ph3)    │
├──────────────────────────────────────────────────┤
│ 1. POST /api/payments/create-order               │
│    - Locks amount/currency to authoritative intent│
│    - Obtains cached OAuth 2.0 token              │
│    - Creates PayPal Sandbox Order (intent: CAPTURE│
│    - Returns orderId & approvalUrl               │
│                                                  │
│ 2. Buyer Sandbox Approval                        │
│    - Buyer redirected to PayPal Sandbox URL      │
│    - Approves transaction in sandbox             │
│    - Redirected to /payment/success?token={order}│
│                                                  │
│ 3. Authoritative Server-Side Capture Gate        │
│    - POST /api/payments/capture-order            │
│    - Verifies order-decision association         │
│    - Server calls POST /v2/checkout/orders/{id}/ │
│      capture                                     │
│    - Records capture status and transaction ID   │
│    - Never marks completed purely on redirect    │
└──────────────────────────────────────────────────┘
```

## Security & Verification Guarantees (Phase 3)

1. **Client Disregard & Tamper Rejection**:
   - The backend never trusts client-supplied status, amounts, or `canProceedToPayment` flags.
   - Any client attempt to alter the amount or currency throws an immediate rejection.
2. **Server-Side Capture Enforcement**:
   - Returning to `/payment/success` does NOT mark payment complete. Only authoritative server-side capture via PayPal Orders API marks `COMPLETED`.
3. **Secret Protection**:
   - `PAYPAL_CLIENT_SECRET` and access tokens are never logged or sent to the browser.
4. **Duplicate Protection**:
   - Active orders in `CREATED` return existing order state to prevent orphan PayPal orders. Repeated captures are checked safely against the payment repository.
5. **Auditable Lifecycle**:
   - `IPaymentRepository` & `InMemoryPaymentRepository` log state transitions: `CREATED` &rarr; `APPROVED_BY_BUYER` &rarr; `COMPLETED` / `CANCELLED` / `FAILED`.

## Groq LLM Integration Architecture (Phase 4.1)

Phase 4.1 establishes a clean, reusable, backend-only LLM service using Groq's high-speed OpenAI-compatible REST API (`https://api.groq.com/openai/v1/chat/completions`).

```
┌────────────────────────────────┐
│   Client / Test Request        │
│   POST /api/agent/test-llm     │
└───────────────┬────────────────┘
                │
                ▼
┌────────────────────────────────┐
│      AgentController           │
│   - Validates user message     │
└───────────────┬────────────────┘
                │
                ▼
┌────────────────────────────────┐
│         LLMService             │
│   - Config validation          │
│   - Default system prompt      │
│   - AbortController timeout    │
│   - Groq Chat Completions REST │
│   - Key & credential redaction │
└───────────────┬────────────────┘
                │ (HTTPS / Bearer Auth)
                ▼
┌────────────────────────────────┐
│      Groq Cloud API            │
│     openai/gpt-oss-120b        │
└────────────────────────────────┘
```

### Security Boundaries in Phase 4.1:
1. **Zero Access to Payment Rails**: The LLM service is completely isolated and cannot call PayPal APIs or manipulate transaction amounts.
2. **Zero Access to Policy Decisions**: The deterministic authorization engine remains 100% backend-authoritative. The LLM cannot approve, review, or block transactions.
3. **Secret Protection**: `GROQ_API_KEY` is loaded strictly on the backend, never surfaced to the frontend, and redacted from all application logs and error messages.
4. **Mocked Testing**: Dependency injection of custom fetch allows 100% test coverage without requiring live API keys in automated CI/CD runs.

## Merchant & Product Discovery Architecture (Phase 4.3)

Phase 4.3 introduces real-world merchant and product discovery using Tavily Web Search REST API (`https://api.tavily.com/search`).

```
┌───────────────────────────────────────────────┐
│              Client Request                   │
│         POST /api/agent/discover              │
│   { "message": "Find me a cheap VPS..." }     │
└───────────────────────┬───────────────────────┘
                        │
                        ▼
┌───────────────────────────────────────────────┐
│               AgentController                 │
│      - Validates non-empty message            │
│      - Clamps maxResults between 1 and 10     │
└───────────────────────┬───────────────────────┘
                        │
                        ▼
┌───────────────────────────────────────────────┐
│              DiscoveryService                 │
│   1. formulateSearchQuery(message)            │
│      - Extracts intent keywords               │
│   2. Query Tavily REST API                    │
│      - Native fetch + AbortController (15s)   │
│      - Strict API key protection              │
│   3. Normalize & Sanitize Results             │
│      - URL validation (http/https only)       │
│      - Strip HTML & prompt injection payloads │
│      - Extract unverifiedListedPrice (if any) │
│      - Label all prices strictly as unverified│
└───────────────────────┬───────────────────────┘
                        │
                        ▼
┌───────────────────────────────────────────────┐
│           Validated Discovery Items           │
│  { success: true, data: { query, results } }  │
└───────────────────────────────────────────────┘
```

### Security Boundaries in Phase 4.3:
1. **Zero Access to Payment Rails**: Discovery is purely informational; it cannot create PayPal orders or capture payments.
2. **Zero Access to Policy Decisions**: Discovery items are NEVER treated as authorization decisions.
3. **No Price Guarantees**: Any retrieved price is labeled as an `unverifiedListedPrice`. Prices are never verified or invented.
4. **Secret Protection**: `TAVILY_API_KEY` is server-only, never sent to the browser, and redacted from all error messages.

## Storage Model & Limitations

- `decisionRepository`: In-memory implementation (`TEMPORARY_IN_MEMORY_STORE`).
- `paymentRepository`: In-memory implementation (`TEMPORARY_IN_MEMORY_PAYMENT_STORE`).
- *Limitation*: Ephemeral storage is cleared on server restart. Fully compatible with future PostgreSQL persistence.

## Phase Roadmap

- [x] **Phase 1**: Full-stack foundation, health API, dark fintech dashboard, simulated telemetry.
- [x] **Phase 2**: Authoritative backend authorization engine, multi-tier spending policies, repository abstraction, audit trail, automated test suite, frontend live integration.
- [x] **Phase 3**: PayPal Sandbox Orders API integration (`/v2/checkout/orders`) with pre-authorization order creation, server-side capture gate, return/cancel pages, and audit logging.
- [x] **Phase 4.1**: Groq LLM integration (`openai/gpt-oss-120b`), secure reusable service, test endpoint (`POST /api/agent/test-llm`), timeout and error sanitization, unit test coverage.
- [x] **Phase 4.2**: Natural-language purchase intent extraction (`POST /api/agent/parse-intent`), budget vs. price distinction, schema normalization, and prompt injection isolation.
- [x] **Phase 4.3**: Merchant and product discovery (`POST /api/agent/discover`) via Tavily REST API, URL validation, unverified listed price extraction, and content sanitization.
- [ ] **Phase 4.4+**: Autonomous purchasing agent, multi-turn procurement loop, and PostgreSQL persistence.

