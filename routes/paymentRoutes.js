const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');

// GET /api/payments/stats/:teacherId?month=X&year=Y
router.get('/stats/:teacherId', paymentController.getPaymentStats);

// POST /api/payments
router.post('/', paymentController.createPayment);
router.post('/fix-fees', paymentController.fixFees); // New fix endpoint

module.exports = router;
