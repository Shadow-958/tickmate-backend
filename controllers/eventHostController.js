const Event = require('../models/Event');
const User = require('../models/User');
const Ticket = require('../models/Ticket');
const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const { cloudinary } = require('../cloudConfig');

// @desc    Get all events created by the host
// @route   GET /api/host/my-events
// @access  Private (host only)
const getMyEvents = async (req, res) => {
  try {
    const hostId = req.user._id;
    const { page = 1, limit = 10, status, category, search } = req.query;

    // Build filter
    const filter = { host: hostId };

    if (status) filter.status = status;
    if (category) filter.category = category;
    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    // Execute query with pagination
    const events = await Event.find(filter)
      .populate('host', 'firstName lastName email')
      .populate('assignedStaff', 'firstName lastName email selectedRole')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const totalEvents = await Event.countDocuments(filter);

    // Calculate statistics for each event
    const eventsWithStats = await Promise.all(events.map(async (event) => {
      const totalTickets = await Ticket.countDocuments({ eventId: event._id });
      const checkedInTickets = await Ticket.countDocuments({ 
        eventId: event._id, 
        'checkInStatus.isCheckedIn': true 
      });

      return {
        ...event.toObject(),
        statistics: {
          totalTicketsSold: totalTickets,
          checkedInAttendees: checkedInTickets,
          revenue: totalTickets * (event.pricing.isFree ? 0 : event.pricing.price),
          availableTickets: event.capacity - totalTickets
        }
      };
    }));

    res.status(200).json({
      success: true,
      count: eventsWithStats.length,
      totalEvents,
      currentPage: parseInt(page),
      totalPages: Math.ceil(totalEvents / limit),
      events: eventsWithStats
    });
  } catch (error) {
    console.error('Get my events error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching events',
      error: error.message
    });
  }
};

// @desc    Create new event
// @route   POST /api/host/events
// @access  Private (host only)
const createEvent = async (req, res) => {
  try {
    const hostId = req.user._id;

    const {
      title,
      description,
      category,
      location,
      startDateTime,
      endDateTime,
      pricing,
      capacity,
      features,
      assignedStaff = []
    } = req.body;

    // Validation
    if (!title || !description || !category || !location || !startDateTime || !endDateTime || !capacity) {
      return res.status(400).json({
        success: false,
        message: 'Please provide all required fields'
      });
    }

    // Validate dates
    const start = new Date(startDateTime);
    const end = new Date(endDateTime);
    const now = new Date();

    if (start <= now) {
      return res.status(400).json({
        success: false,
        message: 'Event start date must be in the future'
      });
    }

    if (end <= start) {
      return res.status(400).json({
        success: false,
        message: 'Event end date must be after start date'
      });
    }

    // Parse pricing if it's a string
    let parsedPricing = pricing;
    if (typeof pricing === 'string') {
      try {
        parsedPricing = JSON.parse(pricing);
      } catch (error) {
        return res.status(400).json({
          success: false,
          message: 'Invalid pricing format'
        });
      }
    }

    // Parse location if it's a string
    let parsedLocation = location;
    if (typeof location === 'string') {
      try {
        parsedLocation = JSON.parse(location);
      } catch (error) {
        // If it's not JSON, treat it as a simple venue string
        parsedLocation = {
          venue: location,
          address: location,
          city: '',
          state: '',
          zipCode: ''
        };
      }
    }

    // Prepare event data
    const eventData = {
      title,
      description,
      category,
      location: parsedLocation,
      startDateTime: start,
      endDateTime: end,
      pricing: parsedPricing,
      capacity: parseInt(capacity),
      host: hostId,
      features: features || {},
      assignedStaff: assignedStaff.filter(staffId => staffId) // Remove empty values
    };

    // Handle banner image upload
    if (req.file) {
      eventData.bannerImageUrl = req.file.path;
    }

    // Create event
    const event = new Event(eventData);
    await event.save();

    // Populate host and staff information
    const populatedEvent = await Event.findById(event._id)
      .populate('host', 'firstName lastName email hostProfile')
      .populate('assignedStaff', 'firstName lastName email');

    // Update host's event count
    await User.findByIdAndUpdate(hostId, {
      $inc: { 'hostProfile.eventsCreated': 1 }
    });

    res.status(201).json({
      success: true,
      message: 'Event created successfully',
      event: populatedEvent
    });
  } catch (error) {
    console.error('Create event error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error creating event',
      error: error.message
    });
  }
};

// @desc    Update event
// @route   PUT /api/host/events/:id
// @access  Private (host only)
const updateEvent = async (req, res) => {
  try {
    const eventId = req.params.id;
    const hostId = req.user._id;

    // Find event and verify ownership
    const event = await Event.findOne({ _id: eventId, host: hostId });
    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Event not found or you are not authorized to update it'
      });
    }

    // Check if event has already started
    if (new Date(event.startDateTime) <= new Date()) {
      return res.status(400).json({
        success: false,
        message: 'Cannot update event that has already started'
      });
    }

    const updateData = { ...req.body };

    // Validate dates if provided
    if (updateData.startDateTime || updateData.endDateTime) {
      const start = new Date(updateData.startDateTime || event.startDateTime);
      const end = new Date(updateData.endDateTime || event.endDateTime);
      const now = new Date();

      if (start <= now) {
        return res.status(400).json({
          success: false,
          message: 'Event start date must be in the future'
        });
      }

      if (end <= start) {
        return res.status(400).json({
          success: false,
          message: 'Event end date must be after start date'
        });
      }
    }

    // Handle banner image upload
    if (req.file) {
      updateData.bannerImageUrl = req.file.path;
    }

    // Parse JSON fields if they're strings
    ['pricing', 'location', 'features'].forEach(field => {
      if (updateData[field] && typeof updateData[field] === 'string') {
        try {
          updateData[field] = JSON.parse(updateData[field]);
        } catch (error) {
          // Skip parsing if invalid JSON
        }
      }
    });

    // Update event
    const updatedEvent = await Event.findByIdAndUpdate(
      eventId,
      updateData,
      { new: true, runValidators: true }
    ).populate('host', 'firstName lastName email')
     .populate('assignedStaff', 'firstName lastName email');

    res.status(200).json({
      success: true,
      message: 'Event updated successfully',
      event: updatedEvent
    });
  } catch (error) {
    console.error('Update event error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error updating event',
      error: error.message
    });
  }
};

// @desc    Delete event
// @route   DELETE /api/host/events/:id
// @access  Private (host only)
const deleteEvent = async (req, res) => {
  try {
    const eventId = req.params.id;
    const hostId = req.user._id;

    // Find event and verify ownership
    const event = await Event.findOne({ _id: eventId, host: hostId });
    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Event not found or you are not authorized to delete it'
      });
    }

    // Check if event has tickets sold
    const ticketCount = await Ticket.countDocuments({ eventId });
    if (ticketCount > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete event with sold tickets. Cancel the event instead.'
      });
    }

    await Event.findByIdAndDelete(eventId);

    res.status(200).json({
      success: true,
      message: 'Event deleted successfully'
    });
  } catch (error) {
    console.error('Delete event error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error deleting event',
      error: error.message
    });
  }
};

// @desc    Get event attendees
// @route   GET /api/host/events/:id/attendees
// @access  Private (host only)
const getEventAttendees = async (req, res) => {
  try {
    const eventId = req.params.id;
    const hostId = req.user._id;

    // Verify event ownership
    const event = await Event.findOne({ _id: eventId, host: hostId });
    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Event not found or you are not authorized to access it'
      });
    }

    // Get all tickets for this event
    const tickets = await Ticket.find({ eventId })
      .populate('attendeeId', 'firstName lastName email phone')
      .populate('eventId', 'title startDateTime location')
      .sort({ bookingDate: -1 });

    // Group attendees by check-in status
    const attendeesStats = {
      total: tickets.length,
      checkedIn: tickets.filter(t => t.checkInStatus.isCheckedIn).length,
      notCheckedIn: tickets.filter(t => !t.checkInStatus.isCheckedIn).length,
      cancelled: tickets.filter(t => t.status === 'cancelled').length
    };

    res.status(200).json({
      success: true,
      event: {
        id: event._id,
        title: event.title,
        startDateTime: event.startDateTime,
        capacity: event.capacity
      },
      stats: attendeesStats,
      attendees: tickets.map(ticket => ({
        ticketId: ticket._id,
        ticketNumber: ticket.ticketNumber,
        attendee: ticket.attendeeId,
        bookingDate: ticket.bookingDate,
        pricePaid: ticket.pricePaid,
        status: ticket.status,
        paymentStatus: ticket.paymentStatus,
        checkIn: {
          isCheckedIn: ticket.checkInStatus.isCheckedIn,
          checkInTime: ticket.checkInStatus.checkInTime,
          checkedInBy: ticket.checkInStatus.checkedInBy
        },
        specialRequirements: ticket.attendeeInfo?.specialRequirements
      }))
    });
  } catch (error) {
    console.error('Get event attendees error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching attendees',
      error: error.message
    });
  }
};

// @desc    Get host analytics
// @route   GET /api/host/analytics
// @access  Private (host only)
const getHostAnalytics = async (req, res) => {
  try {
    const hostId = req.user._id;
    const { timeRange = '30d' } = req.query;

    // Calculate date range
    const now = new Date();
    let startDate;

    switch (timeRange) {
      case '7d':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '90d':
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    // Get all host events
    const events = await Event.find({ host: hostId });
    const eventIds = events.map(e => e._id);

    // Get tickets data
    const allTickets = await Ticket.find({ eventId: { $in: eventIds } });
    const recentTickets = await Ticket.find({ 
      eventId: { $in: eventIds },
      createdAt: { $gte: startDate }
    });

    // Calculate analytics
    const analytics = {
      overview: {
        totalEvents: events.length,
        totalTicketsSold: allTickets.length,
        totalRevenue: allTickets.reduce((sum, ticket) => sum + ticket.pricePaid, 0),
        upcomingEvents: events.filter(e => new Date(e.startDateTime) > now).length
      },
      recent: {
        recentTicketsSold: recentTickets.length,
        recentRevenue: recentTickets.reduce((sum, ticket) => sum + ticket.pricePaid, 0)
      },
      eventBreakdown: events.map(event => {
        const eventTickets = allTickets.filter(t => t.eventId.toString() === event._id.toString());
        const checkedIn = eventTickets.filter(t => t.checkInStatus.isCheckedIn).length;

        return {
          eventId: event._id,
          title: event.title,
          startDateTime: event.startDateTime,
          capacity: event.capacity,
          ticketsSold: eventTickets.length,
          checkedIn,
          revenue: eventTickets.reduce((sum, ticket) => sum + ticket.pricePaid, 0),
          status: event.status
        };
      }),
      categoryDistribution: events.reduce((acc, event) => {
        acc[event.category] = (acc[event.category] || 0) + 1;
        return acc;
      }, {})
    };

    res.status(200).json({
      success: true,
      timeRange,
      analytics
    });
  } catch (error) {
    console.error('Get host analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching analytics',
      error: error.message
    });
  }
};

// @desc    Get event analytics including attendance
// @route   GET /api/host/events/:eventId/analytics
// @access  Private (host only)
const getEventAnalytics = async (req, res) => {
  try {
    const { eventId } = req.params;
    const hostId = req.user._id;

    // Verify event ownership
    const event = await Event.findOne({ _id: eventId, host: hostId })
      .populate('assignedStaff', 'firstName lastName email');

    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Event not found or you do not have permission'
      });
    }

    // Get all tickets
    const allTickets = await Ticket.find({ eventId })
      .populate('attendeeId', 'firstName lastName email')
      .populate('verification.scannedBy', 'firstName lastName');

    // Calculate statistics
    const totalTickets = allTickets.length;
    const activeTickets = allTickets.filter(t => t.status === 'active').length;
    const cancelledTickets = allTickets.filter(t => t.status === 'cancelled').length;
    const scannedTickets = allTickets.filter(t => t.verification?.isScanned).length;
    const unscannedTickets = activeTickets - scannedTickets;

    // Revenue calculation
    const totalRevenue = allTickets
      .filter(t => t.status === 'active')
      .reduce((sum, ticket) => sum + ticket.pricePaid, 0);

    // Attendance by time (hourly breakdown for event day)
    const scannedByHour = {};
    allTickets.forEach(ticket => {
      if (ticket.verification?.scannedAt) {
        const hour = new Date(ticket.verification.scannedAt).getHours();
        scannedByHour[hour] = (scannedByHour[hour] || 0) + 1;
      }
    });

    res.status(200).json({
      success: true,
      analytics: {
        event: {
          title: event.title,
          startDateTime: event.startDateTime,
          endDateTime: event.endDateTime,
          capacity: event.capacity,
          status: event.status
        },
        ticketStats: {
          totalTickets,
          activeTickets,
          cancelledTickets,
          scannedTickets,
          unscannedTickets,
          attendanceRate: activeTickets > 0 ? ((scannedTickets / activeTickets) * 100).toFixed(2) : 0
        },
        revenue: {
          totalRevenue: totalRevenue / 100, // Convert from cents
          averageTicketPrice: activeTickets > 0 ? (totalRevenue / activeTickets / 100).toFixed(2) : 0
        },
        attendance: {
          scannedByHour,
          recentScans: allTickets
            .filter(t => t.verification?.isScanned)
            .sort((a, b) => new Date(b.verification.scannedAt) - new Date(a.verification.scannedAt))
            .slice(0, 10)
            .map(ticket => ({
              attendee: `${ticket.attendeeId.firstName} ${ticket.attendeeId.lastName}`,
              scannedAt: ticket.verification.scannedAt,
              scannedBy: ticket.verification.scannedBy 
                ? `${ticket.verification.scannedBy.firstName} ${ticket.verification.scannedBy.lastName}`
                : 'Unknown'
            }))
        },
        staff: event.assignedStaff.map(staff => ({
          name: `${staff.firstName} ${staff.lastName}`,
          email: staff.email,
          scansPerformed: allTickets.filter(t => 
            t.verification?.scannedBy?.toString() === staff._id.toString()
          ).length
        }))
      }
    });
  } catch (error) {
    console.error('Get event analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching analytics',
      error: error.message
    });
  }
};


module.exports = {
  getMyEvents,
  createEvent,
  updateEvent,
  deleteEvent,
  getEventAttendees,
  getHostAnalytics
};