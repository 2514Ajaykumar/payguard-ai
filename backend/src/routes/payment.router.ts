import { Router } from 'express';
import { paymentController } from '../controllers/payment.controller';

const router = Router();

// POST /api/payments/create-order - Authoritative creation of PayPal Sandbox order
router.post('/create-order', paymentController.createOrder);

// POST /api/payments/capture-order - Server-side authoritative capture of approved order
router.post('/capture-order', paymentController.captureOrder);

// POST /api/payments/cancel-order - Buyer cancellation handler
router.post('/cancel-order', paymentController.cancelOrder);

// GET /api/payments/order/:orderId - Retrieve payment details by PayPal order ID
router.get('/order/:orderId', paymentController.getPaymentByOrderId);

// GET /api/payments - List payment records
router.get('/', paymentController.listPayments);

export default router;
