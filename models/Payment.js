const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  // Payment identifiers
  paymentId: {
    type: String,
    unique: true,
    required: true
  },

  transactionId: {
    type: String,
    unique: true,
    required: true
  },

  // Order information
  orderId: {
    type: String,
    required: true
  },

  // Event and user references
  eventId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Event',
    required: true
  },

  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  // Payment details
  amount: {
    type: Number,
    required: true,
    min: 0
  },

  currency: {
    type: String,
    required: true,
    default: 'USD',
    enum: ['USD', 'EUR', 'INR', 'GBP']
  },

  // Payment status
  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed', 'cancelled', 'refunded'],
    default: 'pending'
  },

  // Payment gateway details (Demo)
  gateway: {
    name: {
      type: String,
      default: 'DemoPaymentGateway'
    },
    gatewayTransactionId: String,
    gatewayResponse: {
      type: mongoose.Schema.Types.Mixed
    }
  },

  // Payment method
  paymentMethod: {
    type: String,
    enum: ['credit_card', 'debit_card', 'net_banking', 'upi', 'wallet'],
    required: true
  },

  // Card details (for demo - in production, never store full card details)
  cardDetails: {
    last4Digits: String,
    cardType: {
      type: String,
      enum: ['visa', 'mastercard', 'amex', 'rupay']
    }
  },

  // Timestamps
  initiatedAt: {
    type: Date,
    default: Date.now
  },

  completedAt: {
    type: Date
  },

  failedAt: {
    type: Date
  },

  // Error information
  error: {
    code: String,
    message: String,
    details: mongoose.Schema.Types.Mixed
  },

  // Refund information
  refund: {
    isRefunded: {
      type: Boolean,
      default: false
    },
    refundId: String,
    refundAmount: Number,
    refundDate: Date,
    refundReason: String
  },

  // Additional metadata
  metadata: {
    ipAddress: String,
    userAgent: String,
    deviceInfo: String
  }
}, { 
  timestamps: true 
});

// Indexes for performance
paymentSchema.index({ paymentId: 1 });
paymentSchema.index({ transactionId: 1 });
paymentSchema.index({ orderId: 1 });
paymentSchema.index({ eventId: 1 });
paymentSchema.index({ userId: 1 });
paymentSchema.index({ status: 1 });
paymentSchema.index({ initiatedAt: -1 });

const Payment = mongoose.model('Payment', paymentSchema);

module.exports = Payment;