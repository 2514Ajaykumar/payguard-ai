import { Router } from 'express';
import { policyController } from '../controllers/policy.controller';

const router = Router();

// GET /api/policies
router.get('/', policyController.getPolicies);

// PUT /api/policies
router.put('/', policyController.updatePolicies);

// POST /api/policies/reset
router.post('/reset', policyController.resetPolicies);

export default router;
