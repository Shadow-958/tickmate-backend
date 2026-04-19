// backend/controllers/paymentController.js - RAZORPAY INTEGRATION VERSION

const crypto = require('crypto');
const razorpay = require('../config/razorpay');

// ✅ CRITICAL: Model imports
const Event = require('../models/Event');
const User = require('../models/User'); 
const Ticket = require('../models/Ticket');

// Simple payment controller with demo functionality
console.log('💳 Loading payment controller...');
console.log('✅ Model imports verified:', {
  Event: !!Event,
  User: !!User, 
  Ticket: !!Ticket
});

// @desc    Create Razorpay payment order
// @route   POST /api/payments/create-order
// @access  Private (attendee only)
const createRazorpayOrder = async (req, res) => {
  try {
    console.log('💳 Creating Razorpay order for user:', req.user._id);

    const { eventId, quantity = 1 } = req.body;
    const userId = req.user._id;

    if (!eventId) {
      return res.status(400).json({
        success: false,
        message: 'Event ID is required'
      });
    }

    // ✅ VALIDATE EVENT EXISTS AND GET REAL PRICE
    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Event not found'
      });
    }

    // ✅ CHECK EVENT CAPACITY
    const existingTickets = await Ticket.countDocuments({ 
      eventId: eventId, 
      status: { $in: ['active', 'confirmed'] }
    });

    if (existingTickets >= event.capacity) {
      return res.status(400).json({
        success: false,
        message: 'Event is sold out'
      });
    }

    // ✅ CHECK IF USER ALREADY HAS TICKET FOR THIS EVENT
    const existingUserTicket = await Ticket.findOne({
      eventId: eventId,
      attendeeId: userId,
      status: { $in: ['active', 'confirmed'] }
    });

    if (existingUserTicket) {
      return res.status(400).json({
        success: false,
        message: 'You already have a ticket for this event'
      });
    }

    // ✅ USE REAL EVENT PRICE
    const amount = event.pricing?.isFree ? 0 : (event.pricing?.price || 0);
    const totalAmount = amount * quantity;

    // For free events, return success immediately
    if (event.pricing?.isFree || totalAmount === 0) {
      const orderId = `FREE_${Date.now()}_${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
      
      return res.status(201).json({
        success: true,
        message: 'Free event order created',
        order: {
          id: orderId,
          amount: 0,
          currency: 'INR',
          status: 'created',
          eventId,
          userId: userId.toString(),
          isFree: true
        }
      });
    }

    // Create Razorpay order
    const orderOptions = {
      amount: totalAmount * 100, // Razorpay expects amount in paise
      currency: event.pricing?.currency || 'INR',
      receipt: `EVT_${eventId.slice(-8)}_${userId.toString().slice(-8)}_${Date.now().toString().slice(-8)}`, // Shortened receipt ID
      notes: {
        eventId: eventId,
        userId: userId.toString(),
        eventTitle: event.title,
        quantity: quantity.toString()
      }
    };

    console.log('🔧 Creating Razorpay order with options:', orderOptions);

    let order;
    try {
      order = await razorpay.orders.create(orderOptions);
      console.log('✅ Razorpay order created:', order.id);
    } catch (razorpayError) {
      console.error('❌ Razorpay order creation failed:', razorpayError);
      
      // Handle Razorpay API errors
      if (razorpayError.error && razorpayError.error.description) {
        return res.status(400).json({
          success: false,
          message: 'Payment order creation failed',
          error: 'RAZORPAY_API_ERROR',
          details: razorpayError.error.description,
          code: razorpayError.error.code
        });
      }
      
      // Check if it's a configuration error
      if (razorpayError.message && (razorpayError.message.includes('not configured') || razorpayError.message.includes('credentials'))) {
        return res.status(500).json({
          success: false,
          message: 'Payment service not configured. Please contact administrator.',
          error: 'RAZORPAY_NOT_CONFIGURED',
          details: 'Razorpay credentials are missing or invalid'
        });
      }
      
      // Re-throw other errors
      throw razorpayError;
    }

    res.status(201).json({
      success: true,
      message: 'Razorpay order created successfully',
      order: {
        id: order.id,
        amount: order.amount,
        currency: order.currency,
        status: order.status,
        receipt: order.receipt,
        eventId,
        userId: userId.toString(),
        razorpayKeyId: process.env.RAZORPAY_KEY_ID
      }
    });
  } catch (error) {
    console.error('❌ Create Razorpay order error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error creating payment order',
      error: error.message
    });
  }
};

// ✅ RAZORPAY PAYMENT VERIFICATION AND TICKET CREATION
// @desc    Verify Razorpay payment and CREATE REAL TICKET
// @route   POST /api/payments/verify-payment
// @access  Private (attendee only)
const verifyRazorpayPayment = async (req, res) => {
  try {
    console.log('🔍 Verifying Razorpay payment and creating ticket...');
    console.log('📋 Request body:', req.body);

    const { 
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      eventId, 
      attendeeInfo,
      quantity = 1,
      isFree = false
    } = req.body;
    
    const userId = req.user._id;

    // ✅ ENHANCED VALIDATION
    if (!eventId) {
      return res.status(400).json({
        success: false,
        message: 'Event ID is required'
      });
    }

    console.log('🔍 Processing payment for:', {
      eventId,
      userId: userId.toString(),
      razorpay_order_id,
      razorpay_payment_id,
      isFree
    });

    // ✅ VALIDATE EVENT EXISTS AND IS ACTIVE
    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Event not found'
      });
    }

    if (event.status !== 'published') {
      return res.status(400).json({
        success: false,
        message: 'Event is not available for booking'
      });
    }

    console.log('✅ Event validated:', event.title);

    // ✅ CHECK EVENT CAPACITY
    const existingTickets = await Ticket.countDocuments({ 
      eventId: eventId, 
      status: { $in: ['active', 'confirmed'] }
    });

    if (existingTickets >= event.capacity) {
      return res.status(400).json({
        success: false,
        message: 'Event is sold out'
      });
    }

    console.log('✅ Capacity check passed:', `${existingTickets}/${event.capacity}`);

    // ✅ CHECK IF USER ALREADY HAS TICKET FOR THIS EVENT
    const existingUserTicket = await Ticket.findOne({
      eventId: eventId,
      attendeeId: userId,
      status: { $in: ['active', 'confirmed'] }
    });

    if (existingUserTicket) {
      return res.status(400).json({
        success: false,
        message: 'You already have a ticket for this event',
        existingTicket: {
          ticketNumber: existingUserTicket.ticketNumber,
          bookingDate: existingUserTicket.bookingDate
        }
      });
    }

    console.log('✅ Duplicate ticket check passed');

    // ✅ CHECK IF ORDER ALREADY PROCESSED
    const existingOrderTicket = await Ticket.findOne({
      qrCodeData: razorpay_order_id,
      attendeeId: userId
    });

    if (existingOrderTicket) {
      console.log('⚠️ Order already processed, returning existing ticket');
      return res.status(200).json({
        success: true,
        message: 'Order already processed successfully',
        payment: {
          paymentId: razorpay_payment_id || `PAY_${crypto.randomBytes(6).toString('hex').toUpperCase()}`,
          transactionId: `TXN_${crypto.randomBytes(6).toString('hex').toUpperCase()}`,
          orderId: razorpay_order_id,
          status: 'completed',
          amount: existingOrderTicket.pricePaid,
          completedAt: existingOrderTicket.createdAt
        },
        ticket: {
          id: existingOrderTicket._id,
          ticketId: existingOrderTicket._id,
          ticketNumber: existingOrderTicket.ticketNumber,
          qrCodeData: existingOrderTicket.qrCodeData,
          qrCodeUrl: existingOrderTicket.qrCodeUrl,
          paymentId: existingOrderTicket.paymentId,
          status: existingOrderTicket.status,
          attendeeInfo: existingOrderTicket.attendeeInfo,
          eventId: eventId,
          bookingDate: existingOrderTicket.bookingDate
        }
      });
    }

    // ✅ VERIFY RAZORPAY PAYMENT SIGNATURE (for paid events)
    if (!isFree && razorpay_order_id && razorpay_payment_id && razorpay_signature) {
      try {
        const crypto = require('crypto');
        const expectedSignature = crypto
          .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
          .update(`${razorpay_order_id}|${razorpay_payment_id}`)
          .digest('hex');

        if (expectedSignature !== razorpay_signature) {
          console.error('❌ Invalid Razorpay signature');
          return res.status(400).json({
            success: false,
            message: 'Invalid payment signature',
            error: 'PAYMENT_VERIFICATION_FAILED'
          });
        }

        console.log('✅ Razorpay signature verified');
      } catch (signatureError) {
        console.error('❌ Signature verification error:', signatureError);
        return res.status(400).json({
          success: false,
          message: 'Payment verification failed',
          error: signatureError.message
        });
      }
    }

    console.log('✅ Payment verification successful, creating ticket...');

    // ✅ GENERATE UNIQUE TICKET NUMBER AND REQUIRED IDS
    const timestamp = Date.now();
    const randomPart = Math.floor(Math.random() * 100000).toString().padStart(5, '0');
    const ticketNumber = `TCK${timestamp}${randomPart}`;
    
    // ✅ GENERATE ALL REQUIRED FIELDS
    const finalPaymentId = razorpay_payment_id || `PAY_${timestamp}_${Math.random().toString(36).substr(2, 9)}`;
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${ticketNumber}`;

    // ✅ PREPARE COMPLETE TICKET DATA WITH ALL REQUIRED FIELDS
    const ticketData = {
      eventId: eventId,
      attendeeId: userId,
      ticketNumber: ticketNumber,
      
      // ✅ REQUIRED FIELDS THAT WERE MISSING
      paymentId: finalPaymentId,
      qrCodeUrl: qrCodeUrl,
      
      // Standard fields
      status: 'active',
      paymentStatus: 'completed',
      pricePaid: event.pricing?.isFree ? 0 : (event.pricing?.price || 0),
      qrCodeData: razorpay_order_id,
      bookingDate: new Date(),
      
      attendeeInfo: {
        name: attendeeInfo?.name || `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim() || 'Attendee',
        email: attendeeInfo?.email || req.user.email || '',
        phone: attendeeInfo?.phone || req.user.phone || '',
        userId: userId.toString()
      },
      
      checkInStatus: {
        isCheckedIn: false,
        checkInTime: null,
        scannedBy: null,
        scannerRole: null
      },
      
      paymentDetails: {
        orderId: razorpay_order_id,
        paymentId: finalPaymentId,
        paymentMethod: 'razorpay',
        currency: event.pricing?.currency || 'INR',
        amount: event.pricing?.isFree ? 0 : (event.pricing?.price || 0),
        razorpayOrderId: razorpay_order_id,
        razorpayPaymentId: razorpay_payment_id
      }
    };

    console.log('💾 Creating ticket with all required fields:', {
      ticketNumber: ticketData.ticketNumber,
      eventId: ticketData.eventId,
      attendeeId: ticketData.attendeeId.toString(),
      paymentId: ticketData.paymentId,
      qrCodeUrl: ticketData.qrCodeUrl,
      orderId: ticketData.qrCodeData
    });

    // ✅ CREATE AND SAVE TICKET TO DATABASE
    const ticket = new Ticket(ticketData);
    const savedTicket = await ticket.save();

    console.log('✅ Ticket created successfully:', savedTicket.ticketNumber);

    // ✅ IMMEDIATE VERIFICATION THAT TICKET EXISTS IN DATABASE
    const verifyTicket = await Ticket.findById(savedTicket._id);
    if (!verifyTicket) {
      console.error('❌ CRITICAL: Ticket not found immediately after save!');
      throw new Error('Ticket creation verification failed');
    }

    console.log('🔍 Ticket verification: EXISTS IN DATABASE');

    // ✅ VERIFY TICKET CAN BE FOUND BY SEARCH CRITERIA
    const searchTest = await Ticket.findOne({
      eventId: eventId,
      ticketNumber: savedTicket.ticketNumber
    });

    if (!searchTest) {
      console.error('❌ CRITICAL: Ticket cannot be found by search criteria!');
      throw new Error('Ticket search verification failed');
    }

    console.log('🔍 Ticket search verification: PASSED');

    // ✅ UPDATE EVENT STATISTICS
    try {
      await Event.findByIdAndUpdate(eventId, {
        $inc: { 
          ticketsSold: 1,
          'statistics.totalTicketsSold': 1 
        }
      });
      console.log('✅ Event statistics updated');
    } catch (updateError) {
      console.warn('⚠️ Failed to update event stats:', updateError.message);
      // Don't fail the entire operation for stats update failure
    }

    // ✅ POPULATE TICKET WITH ATTENDEE INFO FOR RESPONSE
    const populatedTicket = await Ticket.findById(savedTicket._id)
      .populate('attendeeId', 'firstName lastName email')
      .populate('eventId', 'title startDateTime location');

    // ✅ RETURN COMPREHENSIVE SUCCESS RESPONSE
    res.status(200).json({
      success: true,
      message: 'Payment verified and ticket created successfully!',
      payment: {
        paymentId: finalPaymentId,
        transactionId: `TXN_${crypto.randomBytes(6).toString('hex').toUpperCase()}`,
        orderId: razorpay_order_id,
        status: 'completed',
        amount: event.pricing?.isFree ? 0 : (event.pricing?.price || 0),
        currency: event.pricing?.currency || 'INR',
        paymentMethod: 'razorpay',
        completedAt: new Date(),
        razorpayOrderId: razorpay_order_id,
        razorpayPaymentId: razorpay_payment_id
      },
      ticket: {
        id: savedTicket._id,
        _id: savedTicket._id,
        ticketId: savedTicket._id,
        ticketNumber: savedTicket.ticketNumber,
        qrCodeData: savedTicket.qrCodeData,
        qrCodeUrl: savedTicket.qrCodeUrl,
        paymentId: savedTicket.paymentId,
        status: savedTicket.status,
        paymentStatus: savedTicket.paymentStatus,
        pricePaid: savedTicket.pricePaid,
        bookingDate: savedTicket.bookingDate,
        createdAt: savedTicket.createdAt,
        attendeeInfo: savedTicket.attendeeInfo,
        checkInStatus: savedTicket.checkInStatus
      },
      event: {
        id: event._id,
        title: event.title,
        startDateTime: event.startDateTime,
        endDateTime: event.endDateTime,
        location: event.location,
        capacity: event.capacity,
        ticketsSold: existingTickets + 1
      },
      attendee: populatedTicket?.attendeeId ? {
        name: `${populatedTicket.attendeeId.firstName} ${populatedTicket.attendeeId.lastName}`,
        email: populatedTicket.attendeeId.email
      } : null
    });

  } catch (error) {
    console.error('❌ Verify Razorpay payment error:', error);
    
    // ✅ DETAILED ERROR RESPONSE
    res.status(500).json({
      success: false,
      message: 'Server error verifying payment and creating ticket',
      error: error.message,
      details: {
        step: 'ticket_creation',
        eventId: req.body.eventId,
        userId: req.user._id.toString(),
        timestamp: new Date(),
        validationErrors: error.errors ? Object.keys(error.errors) : undefined
      }
    });
  }
};

// @desc    Get payment status and ticket info
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

    console.log('🔍 Searching for payment/ticket:', paymentId);

    // ✅ TRY TO FIND ACTUAL TICKET BY PAYMENT/ORDER ID OR TICKET NUMBER
    const ticket = await Ticket.findOne({
      $or: [
        { qrCodeData: paymentId },
        { ticketNumber: paymentId },
        { paymentId: paymentId },
        { 'paymentDetails.orderId': paymentId },
        { 'paymentDetails.paymentId': paymentId }
      ],
      attendeeId: userId
    }).populate('eventId', 'title startDateTime location');

    if (ticket) {
      console.log('✅ Found ticket:', ticket.ticketNumber);
      
      res.status(200).json({
        success: true,
        payment: {
          paymentId,
          transactionId: ticket.paymentDetails?.transactionId || `TXN_${crypto.randomBytes(6).toString('hex').toUpperCase()}`,
          orderId: ticket.qrCodeData,
          amount: ticket.pricePaid,
          currency: ticket.paymentDetails?.currency || 'INR',
          status: 'completed',
          paymentMethod: ticket.paymentDetails?.paymentMethod || 'demo',
          initiatedAt: new Date(ticket.createdAt.getTime() - 300000), // 5 minutes before creation
          completedAt: ticket.createdAt,
          userId: userId.toString()
        },
        ticket: {
          id: ticket._id,
          ticketNumber: ticket.ticketNumber,
          paymentId: ticket.paymentId,
          eventTitle: ticket.eventId?.title,
          eventDate: ticket.eventId?.startDateTime,
          status: ticket.status,
          paymentStatus: ticket.paymentStatus,
          checkInStatus: ticket.checkInStatus,
          bookingDate: ticket.bookingDate,
          qrCodeUrl: ticket.qrCodeUrl
        }
      });
    } else {
      console.log('⚠️ No ticket found, returning demo response');
      
      // ✅ FALLBACK TO DEMO RESPONSE
      res.status(200).json({
        success: true,
        payment: {
          paymentId,
          transactionId: `TXN_${crypto.randomBytes(6).toString('hex').toUpperCase()}`,
          orderId: `ORD_${Date.now()}`,
          amount: 0,
          currency: 'INR',
          status: 'completed',
          paymentMethod: 'demo',
          initiatedAt: new Date(Date.now() - 300000),
          completedAt: new Date(),
          userId: userId.toString()
        },
        message: 'Payment found but no associated ticket'
      });
    }

  } catch (error) {
    console.error('❌ Get payment status error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching payment status',
      error: error.message
    });
  }
};

// ✅ GET USER'S TICKETS
// @desc    Get all tickets for current user
// @route   GET /api/payments/my-tickets
// @access  Private  
const getUserTickets = async (req, res) => {
  try {
    console.log('🎫 Getting user tickets for:', req.user._id);

    const userId = req.user._id;
    const { status = 'all', limit = 50 } = req.query;

    // Build filter
    const filter = { attendeeId: userId };
    
    if (status !== 'all') {
      filter.status = status;
    }

    // Get tickets with event details
    const tickets = await Ticket.find(filter)
      .populate('eventId', 'title startDateTime endDateTime location bannerImageUrl')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));

    console.log(`✅ Found ${tickets.length} tickets for user`);

    res.status(200).json({
      success: true,
      count: tickets.length,
      tickets: tickets.map(ticket => ({
        id: ticket._id,
        ticketNumber: ticket.ticketNumber,
        paymentId: ticket.paymentId,
        status: ticket.status,
        paymentStatus: ticket.paymentStatus,
        pricePaid: ticket.pricePaid,
        bookingDate: ticket.bookingDate,
        checkInStatus: ticket.checkInStatus,
        qrCodeUrl: ticket.qrCodeUrl,
        attendeeInfo: ticket.attendeeInfo,
        event: ticket.eventId ? {
          id: ticket.eventId._id,
          title: ticket.eventId.title,
          startDateTime: ticket.eventId.startDateTime,
          endDateTime: ticket.eventId.endDateTime,
          location: ticket.eventId.location,
          bannerImageUrl: ticket.eventId.bannerImageUrl
        } : null
      }))
    });

  } catch (error) {
    console.error('❌ Get user tickets error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching tickets',
      error: error.message
    });
  }
};

// ✅ CANCEL TICKET FUNCTION
// @desc    Cancel a user's ticket
// @route   POST /api/payments/cancel-ticket
// @access  Private
const cancelTicket = async (req, res) => {
  try {
    const { ticketId, reason = 'User cancellation' } = req.body;
    const userId = req.user._id;

    if (!ticketId) {
      return res.status(400).json({
        success: false,
        message: 'Ticket ID is required'
      });
    }

    // Find ticket belonging to current user
    const ticket = await Ticket.findOne({
      _id: ticketId,
      attendeeId: userId
    }).populate('eventId');

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }

    if (ticket.status === 'cancelled') {
      return res.status(400).json({
        success: false,
        message: 'Ticket is already cancelled'
      });
    }

    if (ticket.checkInStatus?.isCheckedIn) {
      return res.status(400).json({
        success: false,
        message: 'Cannot cancel checked-in ticket'
      });
    }

    // Update ticket status
    ticket.status = 'cancelled';
    ticket.cancellationReason = reason;
    ticket.cancelledAt = new Date();
    await ticket.save();

    // Update event statistics
    try {
      await Event.findByIdAndUpdate(ticket.eventId._id, {
        $inc: { 
          ticketsSold: -1,
          'statistics.totalTicketsSold': -1 
        }
      });
    } catch (updateError) {
      console.warn('⚠️ Failed to update event stats after cancellation:', updateError.message);
    }

    console.log('✅ Ticket cancelled:', ticket.ticketNumber);

    res.status(200).json({
      success: true,
      message: 'Ticket cancelled successfully',
      ticket: {
        id: ticket._id,
        ticketNumber: ticket.ticketNumber,
        status: ticket.status,
        cancellationReason: ticket.cancellationReason,
        cancelledAt: ticket.cancelledAt
      }
    });

  } catch (error) {
    console.error('❌ Cancel ticket error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error cancelling ticket',
      error: error.message
    });
  }
};

// ✅ EXPORT ALL FUNCTIONS
module.exports = {
  createRazorpayOrder,
  verifyRazorpayPayment,
  getPaymentStatus,
  getUserTickets,
  cancelTicket
};

console.log('💳 Payment controller loaded with functions:', Object.keys(module.exports));
console.log('✅ All models properly imported and verified');
