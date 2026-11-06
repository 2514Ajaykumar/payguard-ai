# PayGuard AI — Backend Service

The Node.js + Express + TypeScript backend API providing health monitoring, pre-transaction policy evaluation, and PayPal sandbox integrations.

## Architecture

- **`src/config/`**: Typed environment configuration and validation.
- **`src/middleware/`**: Request logging, centralized error handling, and request validation.
- **`src/controllers/`**: Request handlers mapping endpoints to services.
- **`src/services/`**: Core business logic and external integrations.
- **`src/routes/`**: Modular route definitions.
- **`src/app.ts`**: Express application composition.
- **`src/server.ts`**: HTTP listener with graceful shutdown.

## Endpoints (Phase 1)

- `GET /` — API server welcome & status
- `GET /api` — API manifest & documentation links
- `GET /api/health` — System health, uptime, and runtime diagnostics

## Scripts

```bash
# Install dependencies
npm install

# Run in development mode with live watch
npm run dev

# Run TypeScript type check
npm run typecheck

# Build for production
npm run build

# Start production build
npm start
```

## Environment Variables

Copy `.env.example` to `.env`:
```env
PORT=5000
NODE_ENV=development
CORS_ORIGIN=http://localhost:5173
```
