# PayGuard AI — Frontend Dashboard

The React + Vite + TypeScript + Tailwind CSS fintech dashboard for PayGuard AI.

## Features

- **Dark Fintech Aesthetics**: Charcoal & near-black surfaces, glowing status badges, high-contrast typography, and accessible visual hierarchy.
- **Pre-Transaction Guardrails Overview**: Summary metrics for evaluated, approved, blocked, and pending purchase intents.
- **AI Purchase Request Simulator**: Interactive simulator to evaluate autonomous agent purchase intents before dispatching payments.
- **Simulated Activity Stream**: Realistic demo data stream clearly tagged as simulated, complete with risk scores, policy triggers, and inspector drawers.
- **Dual State Views**: Seamless toggle between Populated Demo Stream and Clean Empty State.
- **Backend Health Integration**: Real-time polling and latency telemetry connected to the Express backend `/api/health` endpoint.
- **Sandbox Compliance**: Explicitly displays Sandbox Simulation indicators without fabricated live PayPal claims.

## Development

```bash
# Install dependencies
npm install

# Run Vite dev server (http://localhost:5173)
npm run dev

# Run TypeScript type check
npm run typecheck

# Build for production
npm run build
```
