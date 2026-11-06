import { Router } from 'express';
import { authorizationController } from '../controllers/authorization.controller';

const router = Router();

// POST /api/authorization/evaluate - Primary authoritative evaluation endpoint
router.post('/evaluate', authorizationController.evaluate);

// GET /api/authorization/decisions - List auditable decision history
router.get('/decisions', authorizationController.listDecisions);

// GET /api/authorization/decisions/:id - Get specific decision details
router.get('/decisions/:id', authorizationController.getDecisionById);

// POST /api/authorization/decisions/:id/review - Reviewer sign-off
router.post('/decisions/:id/review', authorizationController.reviewDecision);

export default router;
