// backend/routes/paymentRoutes.js - COMPLETE UPDATED VERSION

const express = require('express');
const { 
  createRazorpayOrder,
  verifyRazorpayPayment,
  getPaymentStatus,
  getUserTickets,
  cancelTicket
} = require('../controllers/paymentController');

const { authenticate, authorize } = require('../middleware/authMiddleware');

const router = express.Router();

// All payment routes require authentication
router.use(authenticate);

// @route   POST /api/payments/create-order
// @desc    Create Razorpay payment order
// @access  Private (attendee only)
router.post('/create-order', authorize('event_attendee'), createRazorpayOrder);

// @route   POST /api/payments/verify-payment
// @desc    Verify Razorpay payment and create ticket
// @access  Private (attendee only)
router.post('/verify-payment', authorize('event_attendee'), verifyRazorpayPayment);

// @route   GET /api/payments/:paymentId/status
// @desc    Get payment status
// @access  Private
router.get('/:paymentId/status', getPaymentStatus);

// ✅ NEW ROUTE: Get user's tickets
// @route   GET /api/payments/my-tickets
// @desc    Get all tickets for current user
// @access  Private
router.get('/my-tickets', getUserTickets);

// ✅ ADDITIONAL HELPFUL ROUTES

// @route   GET /api/payments/tickets/:ticketId
// @desc    Get specific ticket details
// @access  Private
router.get('/tickets/:ticketId', async (req, res) => {
  try {
    const { ticketId } = req.params;
    const userId = req.user._id;

    const Ticket = require('../models/Ticket');

    // Find ticket belonging to current user
    const ticket = await Ticket.findOne({
      _id: ticketId,
      attendeeId: userId
    }).populate('eventId', 'title startDateTime endDateTime location bannerImageUrl host')
      .populate('eventId.host', 'firstName lastName email');

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }

    res.status(200).json({
      success: true,
      ticket: {
        id: ticket._id,
        ticketNumber: ticket.ticketNumber,
        status: ticket.status,
        paymentStatus: ticket.paymentStatus,
        pricePaid: ticket.pricePaid,
        bookingDate: ticket.bookingDate,
        checkInStatus: ticket.checkInStatus,
        attendeeInfo: ticket.attendeeInfo,
        qrCodeData: ticket.qrCodeData,
        qrCodeUrl: `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${ticket.ticketNumber}`,
        event: ticket.eventId ? {
          id: ticket.eventId._id,
          title: ticket.eventId.title,
          startDateTime: ticket.eventId.startDateTime,
          endDateTime: ticket.eventId.endDateTime,
          location: ticket.eventId.location,
          bannerImageUrl: ticket.eventId.bannerImageUrl,
          host: ticket.eventId.host
        } : null
      }
    });

  } catch (error) {
    console.error('❌ Get ticket details error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching ticket details',
      error: error.message
    });
  }
});

// @route   POST /api/payments/tickets/:ticketId/cancel
// @desc    Cancel a ticket (if allowed)
// @access  Private
router.post('/tickets/:ticketId/cancel', async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { reason = 'User cancellation' } = req.body;
    const userId = req.user._id;

    const Ticket = require('../models/Ticket');
    const Event = require('../models/Event');

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

    // Check if event has started (optional - you might want to allow cancellation before event)
    const now = new Date();
    const eventStart = new Date(ticket.eventId.startDateTime);
    
    if (now >= eventStart) {
      return res.status(400).json({
        success: false,
        message: 'Cannot cancel ticket after event has started'
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
});

// @route   GET /api/payments/stats
// @desc    Get user payment statistics
// @access  Private
router.get('/stats', async (req, res) => {
  try {
    const userId = req.user._id;
    const Ticket = require('../models/Ticket');

    // Get user's ticket statistics
    const totalTickets = await Ticket.countDocuments({ attendeeId: userId });
    const activeTickets = await Ticket.countDocuments({ 
      attendeeId: userId, 
      status: 'active' 
    });
    const cancelledTickets = await Ticket.countDocuments({ 
      attendeeId: userId, 
      status: 'cancelled' 
    });
    const checkedInTickets = await Ticket.countDocuments({ 
      attendeeId: userId, 
      'checkInStatus.isCheckedIn': true 
    });

    // Calculate total spent
    const spentResult = await Ticket.aggregate([
      { $match: { attendeeId: userId, status: 'active' } },
      { $group: { _id: null, totalSpent: { $sum: '$pricePaid' } } }
    ]);

    const totalSpent = spentResult.length > 0 ? spentResult[0].totalSpent : 0;

    // Get recent tickets
    const recentTickets = await Ticket.find({ attendeeId: userId })
      .populate('eventId', 'title startDateTime')
      .sort({ createdAt: -1 })
      .limit(5)
      .select('ticketNumber status bookingDate eventId pricePaid');

    res.status(200).json({
      success: true,
      stats: {
        totalTickets,
        activeTickets,
        cancelledTickets,
        checkedInTickets,
        totalSpent,
        averageTicketPrice: totalTickets > 0 ? (totalSpent / totalTickets) : 0
      },
      recentTickets: recentTickets.map(ticket => ({
        ticketNumber: ticket.ticketNumber,
        eventTitle: ticket.eventId?.title,
        status: ticket.status,
        bookingDate: ticket.bookingDate,
        pricePaid: ticket.pricePaid
      }))
    });

  } catch (error) {
    console.error('❌ Get payment stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching payment statistics',
      error: error.message
    });
  }
});

// ✅ ERROR HANDLING MIDDLEWARE
router.use((error, req, res, next) => {
  console.error('❌ Payment routes error:', error);
  
  if (error.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      message: 'Validation error',
      details: error.message
    });
  }

  if (error.name === 'CastError') {
    return res.status(400).json({
      success: false,
      message: 'Invalid ID format',
      details: error.message
    });
  }

  res.status(500).json({
    success: false,
    message: 'Payment service error',
    error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
  });
});

module.exports = router;
