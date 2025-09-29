const crypto = require('crypto');

// Simple payment controller with demo functionality
console.log('💳 Loading payment controller...');

// @desc    Create demo payment order
// @route   POST /api/payments/create-demo-payment
// @access  Private (attendee only)
const createDemoPayment = async (req, res) => {
  try {
    console.log('💳 Creating demo payment for user:', req.user._id);

    const { eventId, paymentMethod = 'credit_card' } = req.body;
    const userId = req.user._id;

    if (!eventId) {
      return res.status(400).json({
        success: false,
        message: 'Event ID is required'
      });
    }

    // Generate demo payment identifiers
    const paymentId = `DEMO_${crypto.randomBytes(8).toString('hex').toUpperCase()}`;
    const transactionId = `TXN_${crypto.randomBytes(12).toString('hex').toUpperCase()}`;
    const orderId = `ORD_${Date.now()}_${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

    // Demo amount (in real app, get from event)
    const amount = 50.00;

    console.log('✅ Demo payment created:', paymentId);

    res.status(201).json({
      success: true,
      message: 'Demo payment order created successfully',
      payment: {
        paymentId,
        orderId,
        transactionId,
        amount,
        currency: 'USD',
        status: 'pending',
        paymentMethod,
        eventId,
        userId: userId.toString()
      }
    });
  } catch (error) {
    console.error('❌ Create demo payment error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error creating demo payment',
      error: error.message
    });
  }
};

// @desc    Process demo payment verification
// @route   POST /api/payments/verify-demo-payment
// @access  Private (attendee only)
const verifyDemoPayment = async (req, res) => {
  try {
    console.log('🔍 Verifying demo payment...');

    const { paymentId, cardDetails } = req.body;
    const userId = req.user._id;

    if (!paymentId) {
      return res.status(400).json({
        success: false,
        message: 'Payment ID is required'
      });
    }

    // Simulate payment processing delay
    const processingTime = Math.floor(Math.random() * 2000) + 1000; // 1-3 seconds

    await new Promise(resolve => setTimeout(resolve, processingTime));

    // Demo success rate (95% success)
    const isSuccessful = Math.random() > 0.05;

    if (isSuccessful) {
      console.log('✅ Demo payment successful:', paymentId);

      // Generate demo ticket number
      const ticketNumber = `TCK${Date.now()}${Math.floor(Math.random() * 1000)}`;

      res.status(200).json({
        success: true,
        message: 'Demo payment verified successfully! Ticket created.',
        payment: {
          paymentId,
          transactionId: `TXN_${crypto.randomBytes(6).toString('hex').toUpperCase()}`,
          status: 'completed',
          amount: 50.00,
          completedAt: new Date()
        },
        ticket: {
          ticketNumber,
          qrCodeUrl: `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${ticketNumber}`,
          status: 'active'
        }
      });
    } else {
      console.log('❌ Demo payment failed:', paymentId);

      res.status(400).json({
        success: false,
        message: 'Demo payment failed - Please try again',
        error: 'Insufficient funds (demo)'
      });
    }
  } catch (error) {
    console.error('❌ Verify demo payment error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error verifying demo payment',
      error: error.message
    });
  }
};

// @desc    Get payment status
// @route   GET /api/payments/:paymentId/status
// @access  Private
const getPaymentStatus = async (req, res) => {
  try {
    console.log('📊 Getting payment status...');

    const { paymentId } = req.params;
    const userId = req.user._id;

    if (!paymentId) {
      return res.status(400).json({
        success: false,
        message: 'Payment ID is required'
      });
    }

    // Demo payment status response
    res.status(200).json({
      success: true,
      payment: {
        paymentId,
        transactionId: `TXN_${crypto.randomBytes(6).toString('hex').toUpperCase()}`,
        orderId: `ORD_${Date.now()}`,
        amount: 50.00,
        currency: 'USD',
        status: 'completed',
        paymentMethod: 'credit_card',
        initiatedAt: new Date(Date.now() - 300000), // 5 minutes ago
        completedAt: new Date(),
        userId: userId.toString()
      }
    });
  } catch (error) {
    console.error('❌ Get payment status error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching payment status',
      error: error.message
    });
  }
};

// CRITICAL: Export all functions
module.exports = {
  createDemoPayment,
  verifyDemoPayment,
  getPaymentStatus
};

console.log('💳 Payment controller loaded with functions:', Object.keys(module.exports));