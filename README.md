# PayGuard AI — Trust Before the Transaction

[![PayPal AI Hackathon](https://img.shields.io/badge/PayPal_AI_Hackathon-2026-0070BA.svg)](https://paypal.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-emerald.svg)](LICENSE)
[![Frontend](https://img.shields.io/badge/Frontend-React_18_+_Vite_+_TS-61DAFB.svg)](frontend/)
[![Backend](https://img.shields.io/badge/Backend-Node.js_+_Express_+_TS-339933.svg)](backend/)

> **PayGuard AI** is an intelligent pre-transaction guardrail and policy enforcement layer designed for autonomous AI agents spending capital via PayPal. It inspects, scores, and verifies purchases *before* transactions are dispatched to the PayPal Orders API.

---

## 📌 Phase 3: PayPal Sandbox Integration

This repository contains the complete implementation of **Phase 3**:
- **Authoritative Decision Gate**: `POST /api/payments/create-order` only creates orders for decisions with status `APPROVED` (`canProceedToPayment === true`). Rejects `BLOCKED`, `REVIEW_REQUIRED`, or tampered amounts/currencies.
- **PayPal OAuth 2.0 Token Caching**: Backend safely retrieves, caches, and uses OAuth access tokens against `https://api-m.sandbox.paypal.com`. Secrets never leak to frontend or logs.
- **PayPal Orders API v2 (intent: CAPTURE)**: Creates sandbox orders bound to the authoritative approved intent. Returns `orderId` and PayPal `approvalUrl`.
- **Server-Side Capture Gate**: `POST /api/payments/capture-order` executes authoritative server-side capture (`POST /v2/checkout/orders/{orderId}/capture`). Payments are never marked completed based purely on frontend redirects.
- **Interactive Frontend Checkout & Audit Trail**:
  - "Pay with PayPal (Sandbox)" action shown only on approved decisions.
  - Return (`/payment/success`) and Cancellation (`/payment/cancel`) views.
  - Dedicated "PayPal Orders" audit trail displaying orders, captures, amounts, and statuses.
- **100% Mocked Test Coverage**: Automated integration test suite simulating PayPal OAuth, order creation, capture, duplicate capture, cancellation, and API failure scenarios without using real money.

---

## 🛠️ Prerequisites

- **Node.js**: `v18.0.0` or higher (Tested on `v22.16.0`)
- **npm**: `v9.0.0` or higher (Tested on `v11.6.0`)

---

## 🚀 Quickstart & Installation

### 1. Clone & Install Dependencies

Run the monorepo installation script from the project root:

```bash
# Install root, backend, and frontend dependencies
npm run install:all
```

Alternatively, you can install them individually:
```bash
# Backend
cd backend && npm install

# Frontend
cd ../frontend && npm install
```

### 2. Configure Environment Variables

Both `backend/` and `frontend/` come with ready-to-use `.env.example` templates with safe local defaults.

To create local environment files:
```bash
# Root template
cp .env.example .env

# Backend
cp backend/.env.example backend/.env

# Frontend
cp frontend/.env.example frontend/.env
```

*(Default settings run the backend on port `5000` and the frontend on port `5173` without any edits needed).*

---

## 💻 Running the Application

### Option A: Run Both Concurrently (Recommended)

From the project root:
```bash
npm run dev
```
This boots both the Express backend and the Vite development server concurrently with color-coded logs:
- **Frontend Dashboard**: [http://localhost:5173](http://localhost:5173)
- **Backend API**: [http://localhost:5000/api](http://localhost:5000/api)
- **Health Endpoint**: [http://localhost:5000/api/health](http://localhost:5000/api/health)

### Option B: Run Services Independently

In Terminal 1 (Backend):
```bash
npm run dev:backend
# or cd backend && npm run dev
```

In Terminal 2 (Frontend):
```bash
npm run dev:frontend
# or cd frontend && npm run dev
```

---

## 🧪 Testing & Validation

### Type Checking & Build Verification

Run TypeScript compilation checks across both codebases:
```bash
# Run type checks for both frontend & backend
npm run typecheck

# Build both frontend & backend for production
npm run build
```

### Health Endpoint Check

Verify that the backend health service is running:
```bash
# Using curl or browser
curl http://localhost:5000/api/health
```

Expected JSON output:
```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "service": "payguard-ai-backend",
    "version": "1.0.0",
    "environment": "development",
    "uptimeSeconds": 12,
    "checks": {
      "system": "operational",
      "memoryUsageMB": 42.15,
      "nodeVersion": "v22.16.0"
    }
  }
}
```

The frontend dashboard automatically queries this endpoint every few seconds and displays a live connection status pill with network latency in the top navigation bar.

---

## 📁 Repository Structure

```
payguard-ai/
├── backend/                  # Node.js + Express + TypeScript API
│   ├── src/
│   │   ├── config/           # Typed environment variables
│   │   ├── controllers/      # Health & business controllers
│   │   ├── middleware/       # Centralized error, logger & validation
│   │   ├── routes/           # Express API router & health router
│   │   ├── services/         # Health monitoring service
│   │   ├── app.ts            # Express app assembly & CORS
│   │   └── server.ts         # Server listener with graceful shutdown
│   ├── .env.example
│   ├── package.json
│   ├── tsconfig.json
│   └── README.md
├── frontend/                 # React 18 + Vite + TypeScript + Tailwind
│   ├── src/
│   │   ├── components/       # Layout, dashboard cards, tables & views
│   │   ├── services/         # Typed API clients (health check)
│   │   ├── types/            # TypeScript interfaces
│   │   ├── data/             # Realistic simulated demo telemetry
│   │   ├── App.tsx           # Main application shell
│   │   └── main.tsx          # React DOM entry point
│   ├── .env.example
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts        # Dev server proxy configuration
│   ├── tailwind.config.js    # Fintech dark palette tokens
│   └── README.md
├── docs/                     # Architectural diagrams & specifications
│   ├── ARCHITECTURE.md
│   └── API_SPEC.md
├── .env.example              # Monorepo environment blueprint
├── .gitignore                # Production git ignore configuration
├── package.json              # Monorepo orchestrator
└── README.md                 # Project documentation
```

---

---

## 🔒 Security & Sandbox Standards

1. **Backend-Owned Credentials**: `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET` reside solely in backend `.env` and are never logged or exposed to the client or browser.
2. **Authoritative Decision Gate**: Order creation (`POST /api/payments/create-order`) and capture (`POST /api/payments/capture-order`) enforce backend verification. Client cannot override approved amount or currency.
3. **No Uncaptured Success**: Payments are never completed based merely on URL redirects. Authoritative server-to-server call to PayPal (`/v2/checkout/orders/{id}/capture`) is mandatory.
4. **Current Limitations**:
   - Repository storage is currently in-memory (`TEMPORARY_IN_MEMORY_PAYMENT_STORE`) and resets upon backend server restart.
   - Authentication for supervisor approval endpoints is mock/role-based and will be hardened with user sessions/JWT in future phases.

---

## 🧪 Testing & Verification

### Running Automated Tests
```bash
# Run backend test suite (41 tests, 16 suites - all mocked, 0 real money used)
npm run test
```

### Type Checking & Production Builds
```bash
# Type check both backend & frontend
npm run typecheck

# Build both applications for production
npm run build
```

### Manual PayPal Sandbox Checkout Flow Verification
1. Add your PayPal Sandbox Developer Credentials to `backend/.env`:
   ```env
   PAYPAL_CLIENT_ID=your_sandbox_client_id
   PAYPAL_CLIENT_SECRET=your_sandbox_client_secret
   PAYPAL_BASE_URL=https://api-m.sandbox.paypal.com
   FRONTEND_URL=http://localhost:5173
   ```
2. Start the application:
   ```bash
   npm run dev
   ```
3. Open `http://localhost:5173` in your browser.
4. In the **AI Request Simulation** panel, select a preset (e.g. $45 USD GitHub Copilot) and click **Simulate AI Request**.
5. Once **APPROVED**, click **Pay with PayPal (Sandbox)**.
6. The app contacts `POST /api/payments/create-order` to retrieve the PayPal order ID and redirects you to PayPal Sandbox.
7. Log in with your PayPal Sandbox Personal/Buyer account and approve the checkout.
8. PayPal redirects back to `http://localhost:5173/payment/success?token={orderId}&PayerID={payerId}`.
9. PayGuard executes the server-side capture (`POST /api/payments/capture-order`) and displays the verified settlement receipt.
10. Navigate to **PayPal Orders** in the sidebar to review the full audit record.

---

## 🗺️ Next Steps (Phase 4)

Phase 4 will integrate:
- PostgreSQL database persistence replacing in-memory repositories.
- Configurable LLM provider integration for autonomous policy analysis and risk classification.

