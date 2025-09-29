const express = require('express');
const { 
  createDemoPayment,
  verifyDemoPayment,
  getPaymentStatus
} = require('../controllers/paymentController');

const { authenticate, authorize } = require('../middleware/authMiddleware');

const router = express.Router();

// All payment routes require authentication
router.use(authenticate);

// @route   POST /api/payments/create-demo-payment
// @desc    Create demo payment order
// @access  Private (attendee only)
router.post('/create-demo-payment', authorize('event_attendee'), createDemoPayment);

// @route   POST /api/payments/verify-demo-payment
// @desc    Process demo payment verification
// @access  Private (attendee only)
router.post('/verify-demo-payment', authorize('event_attendee'), verifyDemoPayment);

// @route   GET /api/payments/:paymentId/status
// @desc    Get payment status
// @access  Private
router.get('/:paymentId/status', getPaymentStatus);

module.exports = router;