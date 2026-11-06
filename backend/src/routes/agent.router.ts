import { Router } from 'express';
import { agentController } from '../controllers/agent.controller';

const router = Router();

// POST /api/agent/test-llm - Test basic Groq LLM integration
router.post('/test-llm', agentController.testLLM);

// POST /api/agent/parse-intent - Phase 4.2 Natural Language Purchase Intent Extraction
router.post('/parse-intent', agentController.parseIntent);

// POST /api/agent/discover - Phase 4.3 Merchant and Product Discovery
router.post('/discover', agentController.discover);

export default router;
