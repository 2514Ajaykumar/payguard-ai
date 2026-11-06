# PayGuard AI — API Specification (Phase 4.3: Merchant and Product Discovery)

Base URL: `http://localhost:5000/api`

---

### 1. Root Manifest
- **URL**: `GET /api`
- **Description**: Returns API meta information, active phase, and registered endpoints.
- **Response**: `200 OK`
```json
{
  "name": "PayGuard AI API",
  "description": "Pre-transaction AI Guardrails, PayPal Orders Sandbox Checkout Flow & Groq LLM Engine",
  "version": "1.5.0",
  "endpoints": {
    "health": "/api/health",
    "policies": "/api/policies",
    "evaluateAuthorization": "/api/authorization/evaluate",
    "decisionsList": "/api/authorization/decisions",
    "createPaymentOrder": "/api/payments/create-order",
    "capturePaymentOrder": "/api/payments/capture-order",
    "cancelPaymentOrder": "/api/payments/cancel-order",
    "listPayments": "/api/payments",
    "testLLM": "/api/agent/test-llm",
    "parseIntent": "/api/agent/parse-intent",
    "discoverProducts": "/api/agent/discover"
  },
  "phase": "Phase 4.3 - Merchant and Product Discovery"
}
```

---

### 2. Evaluate Purchase Intent (Primary Authoritative Gate)
- **URL**: `POST /api/authorization/evaluate`
- **Description**: Evaluates an autonomous agent's purchase intent against spending policies. Backend is strictly authoritative.
- **Request Body**:
```json
{
  "agentId": "DevOps-Autonomous-Bot-4",
  "merchantName": "GitHub Inc.",
  "merchantDomain": "github.com",
  "category": "Developer Tools",
  "amount": 45.00,
  "currency": "USD",
  "description": "GitHub Copilot monthly renewal",
  "userBudgetLimit": 200.00
}
```
- **Response (`200 OK`)**:
```json
{
  "success": true,
  "data": {
    "decisionId": "auth_dec_184fa920ec01",
    "status": "APPROVED",
    "canProceedToPayment": true,
    "purchaseIntent": {
      "id": "intent_7c91a0f2",
      "agentId": "DevOps-Autonomous-Bot-4",
      "merchantName": "GitHub Inc.",
      "merchantDomain": "github.com",
      "amount": 45.00,
      "currency": "USD"
    },
    "evaluatedAt": "2026-10-29T11:20:00.000Z",
    "policyVersion": "1.0.0",
    "reasonCodes": [
      "AUTO_APPROVAL_THRESHOLD_SATISFIED"
    ],
    "explanation": "Purchase of $45.00 USD is approved. All mandatory guardrails passed and spend is within the $100.00 auto-approval limit.",
    "policyChecks": [
      { "checkName": "AGENT_IDENTITY", "status": "PASSED", "message": "Agent identity verified: \"DevOps-Autonomous-Bot-4\"." },
      { "checkName": "AMOUNT_VALIDATION", "status": "PASSED", "message": "Amount $45.00 is valid and finite." },
      { "checkName": "CURRENCY_SUPPORTED", "status": "PASSED", "message": "Currency \"USD\" is supported." },
      { "checkName": "SPENDING_THRESHOLD_TIER", "status": "PASSED", "message": "Amount ($45.00) is <= auto-approval threshold ($100.00)." }
    ]
  }
}
```

---

### 3. Retrieve Auditable Decision History
- **URL**: `GET /api/authorization/decisions`
- **Query Parameters**:
  - `status` (`APPROVED` | `REVIEW_REQUIRED` | `BLOCKED`): filter by outcome
  - `agentId` (string): filter by requesting agent
  - `limit` (number): maximum records to return
- **Response (`200 OK`)**:
```json
{
  "success": true,
  "count": 4,
  "storageType": "TEMPORARY_IN_MEMORY_STORE",
  "data": [ /* Array of AuthorizationDecision objects */ ]
}
```

---

### 4. Supervisor Review & Sign-Off
- **URL**: `POST /api/authorization/decisions/:id/review`
- **Description**: Allows a supervisor to manually confirm or reject a `REVIEW_REQUIRED` decision, persisting the audit trail.
- **Request Body**:
```json
{
  "action": "APPROVE",
  "reviewerId": "supervisor_admin",
  "notes": "Verified emergency server cluster provisioning ticket"
}
```
- **Response (`200 OK`)**:
```json
{
  "success": true,
  "message": "Decision successfully updated to APPROVED.",
  "data": {
    "decisionId": "auth_dec_9480",
    "status": "APPROVED",
    "canProceedToPayment": true,
    "reviewMetadata": {
      "reviewedBy": "supervisor_admin",
      "reviewedAt": "2026-10-29T11:22:00.000Z",
      "reviewDecision": "MANUALLY_APPROVED",
      "reviewNotes": "Verified emergency server cluster provisioning ticket"
    }
  }
}
```

---

### 5. Spending Policy Management
- **`GET /api/policies`**: Returns current active policy parameters.
- **`PUT /api/policies`**: Updates thresholds with strict validation (positive amounts, currencies list).
- **`POST /api/policies/reset`**: Resets policies to default values ($100 auto-cap, $500 review cutoff).

---

### 6. PayPal Orders Sandbox Checkout Flow (Phase 3)

#### 6.1 Create PayPal Order
- **URL**: `POST /api/payments/create-order`
- **Description**: Verifies the authoritative decision from the repository. Strictly permits order creation ONLY when decision is `APPROVED` and amount/currency exactly matches the approved intent. Creates an order via PayPal Orders API v2 (`intent: CAPTURE`).
- **Request Body**:
```json
{
  "decisionId": "auth_dec_184fa920ec01",
  "amount": 45.00,
  "currency": "USD",
  "customDescription": "Optional note"
}
```
- **Response (`200 OK`)**:
```json
{
  "success": true,
  "data": {
    "orderId": "5XX12345YY678901Z",
    "approvalUrl": "https://www.sandbox.paypal.com/checkoutnow?token=5XX12345YY678901Z",
    "paymentId": "pay_5a49c403-d642-4217-a006-2581ad3eafe4",
    "status": "CREATED",
    "amount": 45.00,
    "currency": "USD"
  }
}
```
- **Error Responses**:
  - `400 Bad Request`: `decisionId` missing, or amount/currency altered from approved intent.
  - `500 / 403 Forbidden`: Decision is `REVIEW_REQUIRED`, `BLOCKED`, or not found.

#### 6.2 Capture PayPal Order (Server-Side Capture Gate)
- **URL**: `POST /api/payments/capture-order`
- **Description**: Executes authoritative server-to-server capture (`POST /v2/checkout/orders/{orderId}/capture`). Verifies stored order association, ensures payment is never marked completed based purely on client redirect, and safely handles duplicate captures.
- **Request Body**:
```json
{
  "orderId": "5XX12345YY678901Z"
}
```
- **Response (`200 OK`)**:
```json
{
  "success": true,
  "message": "PayPal payment captured successfully on the server.",
  "data": {
    "orderId": "5XX12345YY678901Z",
    "captureId": "2CC98765BB432109X",
    "status": "COMPLETED",
    "decisionId": "auth_dec_184fa920ec01",
    "amount": 45.00,
    "currency": "USD",
    "payerEmail": "buyer-sandbox@payguard.ai",
    "payerId": "PAYER123456"
  }
}
```

#### 6.3 Cancel PayPal Order
- **URL**: `POST /api/payments/cancel-order`
- **Description**: Marks the payment record as `CANCELLED` when buyer aborts checkout in PayPal Sandbox.
- **Request Body**:
```json
{
  "orderId": "5XX12345YY678901Z",
  "reason": "Buyer closed checkout window"
}
```
- **Response (`200 OK`)**:
```json
{
  "success": true,
  "message": "Order cancellation recorded.",
  "data": {
    "paymentId": "pay_5a49c403-...",
    "paypalOrderId": "5XX12345YY678901Z",
    "status": "CANCELLED"
  }
}
```

#### 6.4 List Payment Audit Records
- **URL**: `GET /api/payments`
- **Query Parameters**:
  - `status` (`CREATED` | `APPROVED_BY_BUYER` | `COMPLETED` | `CANCELLED` | `FAILED`)
  - `decisionId` (string)
  - `limit` (number)
- **Response (`200 OK`)**:
```json
{
  "success": true,
  "count": 1,
  "storageType": "TEMPORARY_IN_MEMORY_PAYMENT_STORE",
  "data": [
    {
      "paymentId": "pay_5a49c403-...",
      "decisionId": "auth_dec_184fa920ec01",
      "paypalOrderId": "5XX12345YY678901Z",
      "paypalCaptureId": "2CC98765BB432109X",
      "amount": 45.00,
      "currency": "USD",
      "status": "COMPLETED",
      "createdAt": "2026-10-29T11:45:00.000Z",
      "updatedAt": "2026-10-29T11:46:00.000Z"
    }
  ]
}
```

---

### 7. Health & Diagnostics
- **URL**: `GET /api/health`
- **Response**: `200 OK` (system status, uptime, memory diagnostics)

---

### 8. Groq LLM Agent Integration (Phase 4.1)

#### 8.1 Test LLM Completion
- **URL**: `POST /api/agent/test-llm`
- **Description**: Securely queries the configured Groq LLM model (`GROQ_MODEL`) via OpenAI-compatible REST endpoint. Validates that user message is provided, uses system prompt defaults, enforces backend timeout, and guarantees secrets are never leaked.
- **Security Boundaries**: Strictly decoupled from PayPal payment execution and authorization policy decisions in Phase 4.1.
- **Request Body**:
```json
{
  "message": "Explain what PayGuard AI does in two sentences."
}
```
- **Success Response (`200 OK`)**:
```json
{
  "success": true,
  "data": {
    "response": "PayGuard AI is a pre-transaction guardrail system that intercepts autonomous agent spending requests and evaluates them against corporate spending policies. It ensures complete verification and user authorization before any transaction can be processed via PayPal."
  }
}
```
- **Error Responses**:
  - `400 Bad Request`: Message field is missing or empty
  ```json
  {
    "success": false,
    "error": {
      "code": "VALIDATION_FAILED",
      "message": "Request body must include a non-empty 'message' string"
    }
  }
  ```
  - `503 Service Unavailable`: Groq API key is not configured
  ```json
  {
    "success": false,
    "error": {
      "code": "LLM_NOT_CONFIGURED",
      "message": "Groq LLM API key is not configured. Set GROQ_API_KEY in backend/.env"
    }
  }
  ```
  - `504 Gateway Timeout`: Groq request exceeded timeout limit
  ```json
  {
    "success": false,
    "error": {
      "code": "LLM_TIMEOUT",
      "message": "Groq LLM request timed out after 30000ms"
    }
  }
  ```

#### 8.2 Extract Structured Purchase Intent (Phase 4.2)
- **URL**: `POST /api/agent/parse-intent`
- **Description**: Extracts structured purchase intent from natural language instructions using Groq LLM. Treats user input as untrusted data, distinguishes budget limits from actual product costs, and never invents missing information.
- **Security Boundaries**: Strictly decoupled from PayPal payment execution and the deterministic authorization engine.
- **Request Body**:
```json
{
  "message": "I need a project management subscription under $30 per month."
}
```
- **Success Response (`200 OK`)**:
```json
{
  "success": true,
  "data": {
    "intent": {
      "product": "Project management subscription",
      "merchant": null,
      "domain": null,
      "amount": null,
      "currency": null,
      "budget": 30,
      "billingPeriod": "monthly",
      "description": "A project management subscription",
      "missingInformation": [
        "merchant",
        "domain",
        "actual purchase amount",
        "currency"
      ]
    }
  }
}
```
- **Error Responses**:
  - `400 Bad Request`: Message field is missing or empty
  ```json
  {
    "success": false,
    "error": {
      "code": "INVALID_REQUEST",
      "message": "The 'message' field is required and must be a non-empty string."
    }
  }
  ```

#### 8.3 Merchant and Product Discovery (Phase 4.3)
- **URL**: `POST /api/agent/discover`
- **Description**: Discovers real-world merchants and products matching natural-language criteria using Tavily Web Search. Extracts unverified listed prices only when explicitly supported by retrieved snippet content.
- **Security Boundaries**: Strictly decoupled from PayPal payment execution and the deterministic authorization engine.
- **Request Body**:
```json
{
  "message": "Find me a cheap VPS for hosting my application.",
  "maxResults": 5
}
```
- **Success Response (`200 OK`)**:
```json
{
  "success": true,
  "data": {
    "query": "VPS pricing plans official",
    "extractedIntent": {
      "product": "VPS",
      "merchant": null,
      "domain": null,
      "amount": null,
      "currency": null,
      "budget": null,
      "billingPeriod": null,
      "description": "User is looking for a cheap virtual private server (VPS)",
      "missingInformation": ["merchant", "domain", "actual purchase amount", "currency"]
    },
    "resultsCount": 3,
    "results": [
      {
        "title": "DigitalOcean Droplets Pricing",
        "sourceUrl": "https://www.digitalocean.com/pricing/droplets",
        "merchantName": "DigitalOcean",
        "merchantDomain": "digitalocean.com",
        "description": "Simple, scalable virtual machines starting at $4/mo with SSD storage and predictable pricing.",
        "relevanceScore": 0.95,
        "unverifiedListedPrice": 4.00,
        "currency": "USD"
      }
    ]
  }
}
```
- **Error Responses**:
  - `400 Bad Request`: Missing or empty message
  - `503 Service Unavailable`: Tavily API key is not configured
