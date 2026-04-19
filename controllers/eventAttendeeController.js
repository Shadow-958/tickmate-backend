// backend/controllers/eventAttendeeController.js - COMPLETE UPDATED FILE

const Event = require('../models/Event');
const Ticket = require('../models/Ticket');
const User = require('../models/User');
const Payment = require('../models/Payment');

// @desc    Get all available events for attendees
// @route   GET /api/attendee/events
// @access  Public (can be accessed without login, but better with auth)
const getAvailableEvents = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 12, 
      category, 
      city, 
      search, 
      priceMin, 
      priceMax,
      startDate,
      endDate,
      sortBy = 'startDateTime',
      sortOrder = 'asc'
    } = req.query;

    console.log('🔍 Fetching available events with filters:', {
      page, limit, category, city, search, sortBy
    });

    // Build filter for available events only
    const filter = { 
      status: 'published',
      startDateTime: { $gt: new Date() } // Only future events
    };

    // Add filters
    if (category && category !== 'all') {
      filter.category = category;
    }

    if (city) {
      filter['location.city'] = { $regex: city, $options: 'i' };
    }

    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { 'location.venue': { $regex: search, $options: 'i' } }
      ];
    }

    // Price filter (convert to cents if needed)
    if (priceMin || priceMax) {
      filter['pricing.price'] = {};
      if (priceMin) filter['pricing.price'].$gte = parseFloat(priceMin) * 100; // Convert to cents
      if (priceMax) filter['pricing.price'].$lte = parseFloat(priceMax) * 100; // Convert to cents
    }

    // Date range filter
    if (startDate) {
      filter.startDateTime = { ...filter.startDateTime, $gte: new Date(startDate) };
    }
    if (endDate) {
      filter.startDateTime = { ...filter.startDateTime, $lte: new Date(endDate) };
    }

    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Execute query with pagination
    const events = await Event.find(filter)
      .populate('host', 'firstName lastName hostProfile')
      .select('-assignedStaff') // Don't expose staff info to attendees
      .sort(sort)
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const totalEvents = await Event.countDocuments(filter);

    // Add availability info to events
    const eventsWithAvailability = events.map(event => {
      const availableTickets = event.capacity - event.ticketsSold;
      const isAvailable = availableTickets > 0;
      const isSoldOut = availableTickets <= 0;

      return {
        ...event.toObject(),
        availability: {
          isAvailable,
          isSoldOut,
          availableTickets,
          soldTickets: event.ticketsSold
        }
      };
    });

    // Get categories for filter options
    const categories = await Event.distinct('category', { status: 'published' });

    console.log(`✅ Found ${events.length} events (page ${page}/${Math.ceil(totalEvents / limit)})`);

    res.status(200).json({
      success: true,
      count: eventsWithAvailability.length,
      totalEvents,
      currentPage: parseInt(page),
      totalPages: Math.ceil(totalEvents / limit),
      filters: {
        categories,
        appliedFilters: { category, city, search, priceMin, priceMax, startDate, endDate }
      },
      events: eventsWithAvailability
    });
  } catch (error) {
    console.error('❌ Get available events error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching events',
      error: error.message
    });
  }
};

// @desc    Get single event details
// @route   GET /api/attendee/events/:id
// @access  Public
const getEventDetails = async (req, res) => {
  try {
    const eventId = req.params.id;
    console.log('🔍 Fetching event details for ID:', eventId);

    const event = await Event.findById(eventId)
      .populate('host', 'firstName lastName email hostProfile');

    if (!event) {
      console.log('❌ Event not found for ID:', eventId);
      return res.status(404).json({
        success: false,
        message: 'Event not found'
      });
    }

    // Increment view count (optional - only if stats field exists)
    try {
      await Event.findByIdAndUpdate(eventId, { $inc: { 'stats.views': 1 } });
    } catch (viewError) {
      // Ignore if stats field doesn't exist
      console.log('⚠️ Could not increment view count (field may not exist)');
    }

    // Check if user already has a ticket (if authenticated)
    let userHasTicket = false;
    if (req.user) {
      const existingTicket = await Ticket.findOne({ 
        eventId, 
        attendeeId: req.user._id,
        status: { $ne: 'cancelled' }
      });
      userHasTicket = !!existingTicket;
    }

    // Calculate availability
    const availableTickets = event.capacity - event.ticketsSold;
    const isAvailable = availableTickets > 0 && new Date(event.startDateTime) > new Date();

    const eventWithDetails = {
      ...event.toObject(),
      availability: {
        isAvailable: isAvailable && !userHasTicket,
        availableTickets,
        soldTickets: event.ticketsSold,
        isSoldOut: availableTickets <= 0,
        userHasTicket
      }
    };

    console.log('✅ Returning event details for:', event.title);
    res.status(200).json({
      success: true,
      event: eventWithDetails
    });
  } catch (error) {
    console.error('❌ Get event details error:', error);
    
    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: 'Invalid event ID format'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error fetching event details',
      error: error.message
    });
  }
};

// @desc    Book ticket for event
// @route   POST /api/attendee/book-ticket
// @access  Private (attendee only)
const bookTicket = async (req, res) => {
  try {
    const { eventId, attendeeInfo = {} } = req.body;
    const attendeeId = req.user._id;

    console.log(`🎫 Booking ticket for event ${eventId} by user ${attendeeId}`);

    // Validate event
    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Event not found'
      });
    }

    // Check if event is available for booking
    if (event.status !== 'published') {
      return res.status(400).json({
        success: false,
        message: 'Event is not available for booking'
      });
    }

    // Check if event hasn't started
    if (new Date(event.startDateTime) <= new Date()) {
      return res.status(400).json({
        success: false,
        message: 'Cannot book tickets for events that have already started'
      });
    }

    // Check capacity
    if (event.ticketsSold >= event.capacity) {
      return res.status(400).json({
        success: false,
        message: 'Event is sold out'
      });
    }

    // Check if user already has a ticket
    const existingTicket = await Ticket.findOne({ 
      eventId, 
      attendeeId,
      status: { $ne: 'cancelled' }
    });

    if (existingTicket) {
      return res.status(400).json({
        success: false,
        message: 'You already have a ticket for this event',
        existingTicket: {
          ticketNumber: existingTicket.ticketNumber,
          status: existingTicket.status
        }
      });
    }

    // For free events, create ticket immediately
    if (event.pricing.isFree) {
      // Generate unique ticket number
      const ticketNumber = `TCK${Date.now()}${Math.floor(Math.random() * 1000)}`;

      // Generate QR code data
      const qrCodeData = `${ticketNumber}-${eventId}-${attendeeId}`;

      // Create free ticket
      const ticket = new Ticket({
        eventId,
        attendeeId,
        ticketNumber,
        qrCodeData,
        paymentId: 'FREE_TICKET',
        pricePaid: 0,
        paymentStatus: 'completed',
        status: 'active',
        attendeeInfo,
        bookingDate: new Date()
      });

      await ticket.save();

      // Update event ticket count
      await Event.findByIdAndUpdate(eventId, {
        $inc: { ticketsSold: 1 }
      });

      const populatedTicket = await Ticket.findById(ticket._id)
        .populate('eventId', 'title startDateTime location')
        .populate('attendeeId', 'firstName lastName email');

      console.log('✅ Free ticket booked successfully:', ticket.ticketNumber);

      res.status(201).json({
        success: true,
        message: 'Free ticket booked successfully!',
        ticket: populatedTicket
      });
    } else {
      // For paid events, return payment info
      console.log('💳 Paid event - returning payment details');
      
      res.status(200).json({
        success: true,
        message: 'Please proceed to payment',
        requiresPayment: true,
        event: {
          id: event._id,
          title: event.title,
          price: event.pricing.price,
          currency: event.pricing.currency || 'INR'
        },
        nextStep: 'create_payment'
      });
    }
  } catch (error) {
    console.error('❌ Book ticket error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error booking ticket',
      error: error.message
    });
  }
};

// @desc    Get all bookings/tickets for the current user
// @route   GET /api/attendee/my-bookings
// @access  Private (attendee only)
const getMyBookings = async (req, res) => {
  try {
    const userId = req.user._id;

    console.log('📋 Fetching bookings for user:', userId);

    // Find all tickets for this user
    const tickets = await Ticket.find({ attendeeId: userId })
      .populate({
        path: 'eventId',
        select: 'title description startDateTime endDateTime location pricing bannerImageUrl category'
      })
      .sort({ createdAt: -1 }); // Most recent first

    console.log(`✅ Found ${tickets.length} tickets for user ${userId}`);

    // Format the response
    const bookings = tickets.map(ticket => ({
      _id: ticket._id,
      ticketId: ticket._id,
      ticketNumber: ticket.ticketNumber,
      event: ticket.eventId,
      attendeeId: ticket.attendeeId,
      pricePaid: ticket.pricePaid,
      totalAmount: ticket.pricePaid,
      status: ticket.status,
      paymentStatus: ticket.paymentStatus,
      checkInStatus: ticket.checkInStatus,
      bookingDate: ticket.createdAt,
      createdAt: ticket.createdAt,
      updatedAt: ticket.updatedAt,
      quantity: 1, // Assuming 1 ticket per booking
      paymentId: ticket.paymentId,
      orderId: ticket.orderId
    }));

    res.status(200).json({
      success: true,
      message: 'Bookings fetched successfully',
      bookings,
      tickets: bookings, // Provide both for compatibility
      count: bookings.length,
      stats: {
        total: bookings.length,
        active: bookings.filter(b => b.status === 'active').length,
        cancelled: bookings.filter(b => b.status === 'cancelled').length,
        checkedIn: bookings.filter(b => b.checkInStatus?.isCheckedIn).length
      }
    });

  } catch (error) {
    console.error('❌ Error fetching user bookings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch bookings',
      error: error.message
    });
  }
};

// @desc    Get user's tickets (alias for my-bookings)
// @route   GET /api/attendee/my-tickets
// @access  Private (attendee only)
const getMyTickets = async (req, res) => {
  try {
    const attendeeId = req.user._id;
    const { status = 'all', upcoming = false } = req.query;

    console.log(`🎫 Fetching tickets for user ${attendeeId}, status: ${status}, upcoming: ${upcoming}`);

    // Build filter
    const filter = { attendeeId };

    if (status !== 'all') {
      filter.status = status;
    }

    // Get tickets
    let tickets = await Ticket.find(filter)
      .populate('eventId', 'title description startDateTime endDateTime location bannerImageUrl category host')
      .populate({
        path: 'eventId',
        populate: {
          path: 'host',
          select: 'firstName lastName email hostProfile'
        }
      })
      .sort({ createdAt: -1 });

    // Filter upcoming events if requested
    if (upcoming === 'true') {
      tickets = tickets.filter(ticket => 
        ticket.eventId && new Date(ticket.eventId.startDateTime) > new Date()
      );
    }

    // Group tickets by status
    const ticketsByStatus = {
      active: tickets.filter(t => t.status === 'active').length,
      used: tickets.filter(t => t.status === 'used').length,
      cancelled: tickets.filter(t => t.status === 'cancelled').length,
      expired: tickets.filter(t => t.status === 'expired').length
    };

    // Add booking status to each ticket
    const ticketsWithStatus = tickets.map(ticket => {
      let eventStatus = 'upcoming';

      if (ticket.eventId) {
        const eventDate = new Date(ticket.eventId.startDateTime);
        const now = new Date();

        if (eventDate < now) {
          eventStatus = 'past';
        } else if (eventDate.getTime() - now.getTime() < 24 * 60 * 60 * 1000) {
          eventStatus = 'today';
        }
      }

      return {
        ...ticket.toObject(),
        eventStatus,
        canCancel: ticket.status === 'active' && 
                  ticket.eventId && 
                  new Date(ticket.eventId.startDateTime) > new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours before
      };
    });

    console.log(`✅ Found ${ticketsWithStatus.length} tickets`);

    res.status(200).json({
      success: true,
      count: ticketsWithStatus.length,
      summary: ticketsByStatus,
      tickets: ticketsWithStatus
    });
  } catch (error) {
    console.error('❌ Get my tickets error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching tickets',
      error: error.message
    });
  }
};

// @desc    Get single booking/ticket details
// @route   GET /api/attendee/bookings/:ticketId
// @access  Private (attendee only)
const getBookingDetails = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const userId = req.user._id;

    console.log(`📋 Fetching ticket ${ticketId} for user ${userId}`);

    const ticket = await Ticket.findOne({
      _id: ticketId,
      attendeeId: userId
    }).populate({
      path: 'eventId',
      populate: {
        path: 'host',
        select: 'firstName lastName email'
      }
    });

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found or you do not have access to it'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Booking details fetched successfully',
      booking: ticket
    });

  } catch (error) {
    console.error('❌ Error fetching booking details:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch booking details',
      error: error.message
    });
  }
};

// @desc    Cancel ticket/booking
// @route   PUT /api/attendee/bookings/:ticketId/cancel
// @access  Private (attendee only)
const cancelTicket = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const attendeeId = req.user._id;
    const { reason } = req.body;

    console.log(`❌ Cancelling ticket ${ticketId} for user ${attendeeId}`);

    // Find ticket
    const ticket = await Ticket.findOne({ 
      _id: ticketId, 
      attendeeId,
      status: 'active'
    }).populate('eventId');

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found or cannot be cancelled'
      });
    }

    // Check if event is more than 24 hours away
    const hoursUntilEvent = (new Date(ticket.eventId.startDateTime) - new Date()) / (1000 * 60 * 60);

    if (hoursUntilEvent < 24) {
      return res.status(400).json({
        success: false,
        message: 'Cannot cancel tickets less than 24 hours before the event'
      });
    }

    // Update ticket status
    ticket.status = 'cancelled';
    ticket.cancellation = {
      isCancelled: true,
      cancellationDate: new Date(),
      cancellationReason: reason || 'Cancelled by user',
      refundAmount: ticket.pricePaid
    };

    await ticket.save();

    // Update event ticket count
    await Event.findByIdAndUpdate(ticket.eventId._id, {
      $inc: { ticketsSold: -1 }
    });

    // Handle refund for paid tickets (in real app, process actual refund)
    if (ticket.pricePaid > 0) {
      try {
        await Payment.findOneAndUpdate(
          { paymentId: ticket.paymentId },
          { 
            status: 'refunded',
            'refund.isRefunded': true,
            'refund.refundAmount': ticket.pricePaid,
            'refund.refundDate': new Date(),
            'refund.refundReason': reason || 'Ticket cancelled'
          }
        );
      } catch (paymentError) {
        console.log('⚠️ Could not update payment record:', paymentError.message);
      }
    }

    console.log('✅ Ticket cancelled successfully:', ticketId);

    res.status(200).json({
      success: true,
      message: 'Ticket cancelled successfully',
      refundAmount: ticket.pricePaid,
      ticket: ticket
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

// @desc    Download ticket
// @route   GET /api/attendee/tickets/:ticketId/download
// @access  Private (attendee only)
const downloadTicket = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const attendeeId = req.user._id;

    console.log(`📥 Downloading ticket ${ticketId} for user ${attendeeId}`);

    const ticket = await Ticket.findOne({ 
      _id: ticketId, 
      attendeeId,
      status: { $in: ['active', 'used'] }
    })
    .populate('eventId')
    .populate('attendeeId', 'firstName lastName email');

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found or not accessible'
      });
    }

    // Return ticket data for frontend to generate PDF/image
    res.status(200).json({
      success: true,
      ticket: {
        ticketNumber: ticket.ticketNumber,
        qrCodeData: ticket.qrCodeData,
        event: {
          title: ticket.eventId.title,
          startDateTime: ticket.eventId.startDateTime,
          endDateTime: ticket.eventId.endDateTime,
          location: ticket.eventId.location,
          bannerImageUrl: ticket.eventId.bannerImageUrl
        },
        attendee: {
          name: `${ticket.attendeeId.firstName} ${ticket.attendeeId.lastName}`,
          email: ticket.attendeeId.email
        },
        bookingDate: ticket.bookingDate || ticket.createdAt,
        pricePaid: ticket.pricePaid,
        status: ticket.status
      }
    });

    console.log('✅ Ticket download data sent successfully');
  } catch (error) {
    console.error('❌ Download ticket error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error downloading ticket',
      error: error.message
    });
  }
};

// @desc    Get user's booking statistics
// @route   GET /api/attendee/stats
// @access  Private (attendee only)
const getBookingStats = async (req, res) => {
  try {
    const userId = req.user._id;

    console.log('📊 Fetching booking stats for user:', userId);

    const tickets = await Ticket.find({ attendeeId: userId }).populate('eventId');

    const stats = {
      totalBookings: tickets.length,
      activeTickets: tickets.filter(t => t.status === 'active').length,
      cancelledTickets: tickets.filter(t => t.status === 'cancelled').length,
      checkedInTickets: tickets.filter(t => t.checkInStatus?.isCheckedIn).length,
      totalSpent: tickets.reduce((sum, ticket) => sum + (ticket.pricePaid || 0), 0),
      upcomingEvents: tickets.filter(t => {
        return t.eventId && new Date(t.eventId.startDateTime) > new Date() && t.status === 'active';
      }).length
    };

    console.log('✅ Stats calculated:', stats);

    res.status(200).json({
      success: true,
      stats
    });

  } catch (error) {
    console.error('❌ Error fetching booking stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch booking statistics',
      error: error.message
    });
  }
};

module.exports = {
  getAvailableEvents,
  getEventDetails,
  bookTicket,
  getMyBookings,
  getMyTickets,
  getBookingDetails,
  cancelTicket,
  downloadTicket,
  getBookingStats
};
