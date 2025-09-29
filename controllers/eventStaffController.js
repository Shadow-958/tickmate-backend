const Event = require('../models/Event');
const Ticket = require('../models/Ticket');
const User = require('../models/User');

// @desc    Get assigned events for staff
// @route   GET /api/staff/my-events
// @access  Private (staff only)
const getMyAssignedEvents = async (req, res) => {
  try {
    const staffId = req.user._id;
    
    // Find events where this staff member is assigned
    const events = await Event.find({
      assignedStaff: staffId,
      status: 'published'
    })
    .populate('host', 'firstName lastName email')
    .select('title description startDateTime endDateTime location capacity ticketsSold status')
    .sort({ startDateTime: 1 });

    const eventsWithStats = await Promise.all(events.map(async (event) => {
      const totalTickets = await Ticket.countDocuments({ eventId: event._id, status: 'active' });
      const scannedTickets = await Ticket.countDocuments({ 
        eventId: event._id, 
        'verification.isScanned': true 
      });

      return {
        ...event.toObject(),
        stats: {
          totalTickets,
          scannedTickets,
          unscannedTickets: totalTickets - scannedTickets,
          scanPercentage: totalTickets > 0 ? ((scannedTickets / totalTickets) * 100).toFixed(2) : 0
        }
      };
    }));

    res.status(200).json({
      success: true,
      count: eventsWithStats.length,
      events: eventsWithStats
    });
  } catch (error) {
    console.error('Get assigned events error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching assigned events',
      error: error.message
    });
  }
};

// @desc    Scan/Verify ticket
// @route   POST /api/staff/scan-ticket
// @access  Private (staff only)
const scanTicket = async (req, res) => {
  try {
    const { ticketNumber, qrCodeData, eventId, action = 'entry' } = req.body;
    const staffId = req.user._id;

    if (!ticketNumber && !qrCodeData) {
      return res.status(400).json({
        success: false,
        message: 'Ticket number or QR code data required'
      });
    }

    // Build search query
    let query = {};
    if (ticketNumber) {
      query.ticketNumber = ticketNumber;
    } else if (qrCodeData) {
      query.qrCodeData = qrCodeData;
    }

    // Add event filter if provided
    if (eventId) {
      query.eventId = eventId;
    }

    const ticket = await Ticket.findOne(query)
      .populate('eventId', 'title startDateTime endDateTime location assignedStaff')
      .populate('attendeeId', 'firstName lastName email');

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }

    // Verify staff is assigned to this event
    const isAssigned = ticket.eventId.assignedStaff.some(
      staffMemberId => staffMemberId.toString() === staffId.toString()
    );

    if (!isAssigned) {
      return res.status(403).json({
        success: false,
        message: 'You are not assigned to this event'
      });
    }

    // Check ticket status
    if (ticket.status !== 'active') {
      return res.status(400).json({
        success: false,
        message: `Ticket is ${ticket.status}. Cannot scan inactive tickets.`
      });
    }

    // Check if event has started (for entry)
    const now = new Date();
    const eventStart = new Date(ticket.eventId.startDateTime);
    const eventEnd = new Date(ticket.eventId.endDateTime);

    if (action === 'entry' && now < eventStart) {
      return res.status(400).json({
        success: false,
        message: 'Event has not started yet'
      });
    }

    if (now > eventEnd) {
      return res.status(400).json({
        success: false,
        message: 'Event has already ended'
      });
    }

    // Initialize verification if not exists
    if (!ticket.verification) {
      ticket.verification = {};
    }

    // Handle different scan actions
    if (action === 'entry') {
      if (ticket.verification.isScanned) {
        // Already scanned - show warning but allow re-scan
        ticket.verification.scanCount = (ticket.verification.scanCount || 0) + 1;
      } else {
        // First time scan
        ticket.verification.isScanned = true;
        ticket.verification.scannedAt = now;
        ticket.verification.scannedBy = staffId;
        ticket.verification.entryTime = now;
        ticket.verification.scanCount = 1;
      }
    } else if (action === 'exit') {
      if (!ticket.verification.isScanned) {
        return res.status(400).json({
          success: false,
          message: 'Cannot record exit for unscanned ticket'
        });
      }
      ticket.verification.exitTime = now;
    }

    await ticket.save();

    res.status(200).json({
      success: true,
      message: `Ticket ${action} recorded successfully`,
      data: {
        ticketNumber: ticket.ticketNumber,
        attendee: {
          name: `${ticket.attendeeId.firstName} ${ticket.attendeeId.lastName}`,
          email: ticket.attendeeId.email
        },
        event: {
          title: ticket.eventId.title,
          startDateTime: ticket.eventId.startDateTime
        },
        verification: ticket.verification,
        scanCount: ticket.verification.scanCount,
        isFirstScan: ticket.verification.scanCount === 1
      }
    });
  } catch (error) {
    console.error('Scan ticket error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error scanning ticket',
      error: error.message
    });
  }
};

// @desc    Get event attendance details
// @route   GET /api/staff/events/:eventId/attendance
// @access  Private (staff only)
const getEventAttendance = async (req, res) => {
  try {
    const { eventId } = req.params;
    const staffId = req.user._id;

    // Verify event exists and staff is assigned
    const event = await Event.findById(eventId)
      .populate('host', 'firstName lastName email');

    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Event not found'
      });
    }

    const isAssigned = event.assignedStaff.some(
      staffMemberId => staffMemberId.toString() === staffId.toString()
    );

    if (!isAssigned) {
      return res.status(403).json({
        success: false,
        message: 'You are not assigned to this event'
      });
    }

    // Get all tickets for this event
    const tickets = await Ticket.find({ eventId, status: 'active' })
      .populate('attendeeId', 'firstName lastName email')
      .populate('verification.scannedBy', 'firstName lastName')
      .sort({ 'verification.scannedAt': -1 });

    // Calculate statistics
    const totalTickets = tickets.length;
    const scannedTickets = tickets.filter(t => t.verification?.isScanned).length;
    const unscannedTickets = totalTickets - scannedTickets;
    const attendanceRate = totalTickets > 0 ? ((scannedTickets / totalTickets) * 100).toFixed(2) : 0;

    // Group by scan status
    const scannedList = tickets.filter(t => t.verification?.isScanned);
    const unscannedList = tickets.filter(t => !t.verification?.isScanned);

    // Recent scans (last 10)
    const recentScans = scannedList.slice(0, 10);

    res.status(200).json({
      success: true,
      event: {
        id: event._id,
        title: event.title,
        startDateTime: event.startDateTime,
        endDateTime: event.endDateTime,
        location: event.location,
        host: event.host
      },
      statistics: {
        totalTickets,
        scannedTickets,
        unscannedTickets,
        attendanceRate: parseFloat(attendanceRate)
      },
      recentScans: recentScans.map(ticket => ({
        ticketNumber: ticket.ticketNumber,
        attendee: `${ticket.attendeeId.firstName} ${ticket.attendeeId.lastName}`,
        scannedAt: ticket.verification.scannedAt,
        scanCount: ticket.verification.scanCount
      })),
      allTickets: tickets.map(ticket => ({
        _id: ticket._id,
        ticketNumber: ticket.ticketNumber,
        attendee: {
          name: `${ticket.attendeeId.firstName} ${ticket.attendeeId.lastName}`,
          email: ticket.attendeeId.email
        },
        verification: ticket.verification,
        pricePaid: ticket.pricePaid,
        bookingDate: ticket.createdAt
      }))
    });
  } catch (error) {
    console.error('Get event attendance error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching event attendance',
      error: error.message
    });
  }
};

// @desc    Add staff note to ticket
// @route   POST /api/staff/tickets/:ticketId/note
// @access  Private (staff only)
const addTicketNote = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { note } = req.body;
    const staffId = req.user._id;

    if (!note || note.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Note content is required'
      });
    }

    const ticket = await Ticket.findById(ticketId)
      .populate('eventId', 'assignedStaff');

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }

    // Verify staff is assigned to this event
    const isAssigned = ticket.eventId.assignedStaff.some(
      staffMemberId => staffMemberId.toString() === staffId.toString()
    );

    if (!isAssigned) {
      return res.status(403).json({
        success: false,
        message: 'You are not assigned to this event'
      });
    }

    // Add note
    if (!ticket.staffNotes) {
      ticket.staffNotes = [];
    }

    ticket.staffNotes.push({
      staffId,
      note: note.trim(),
      createdAt: new Date()
    });

    await ticket.save();

    res.status(200).json({
      success: true,
      message: 'Note added successfully'
    });
  } catch (error) {
    console.error('Add ticket note error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error adding note',
      error: error.message
    });
  }
};

// @desc    Get staff dashboard data
// @route   GET /api/staff/dashboard
// @access  Private (staff only)
const getStaffDashboard = async (req, res) => {
  try {
    const staffId = req.user._id;

    // Get events assigned to this staff member
    const assignedEvents = await Event.find({
      assignedStaff: staffId,
      status: 'published'
    }).sort({ startDateTime: 1 });

    // Get today's events
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const todaysEvents = assignedEvents.filter(event => {
      const eventDate = new Date(event.startDateTime);
      return eventDate >= today && eventDate < tomorrow;
    });

    // Get upcoming events (next 7 days)
    const nextWeek = new Date(today);
    nextWeek.setDate(nextWeek.getDate() + 7);

    const upcomingEvents = assignedEvents.filter(event => {
      const eventDate = new Date(event.startDateTime);
      return eventDate >= today && eventDate <= nextWeek;
    });

    // Calculate total scans by this staff member
    const totalScans = await Ticket.countDocuments({
      'verification.scannedBy': staffId
    });

    res.status(200).json({
      success: true,
      dashboard: {
        assignedEventsCount: assignedEvents.length,
        todaysEventsCount: todaysEvents.length,
        upcomingEventsCount: upcomingEvents.length,
        totalScansPerformed: totalScans,
        todaysEvents: todaysEvents.slice(0, 3), // Show first 3
        upcomingEvents: upcomingEvents.slice(0, 5) // Show first 5
      }
    });
  } catch (error) {
    console.error('Get staff dashboard error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching dashboard data',
      error: error.message
    });
  }
};

module.exports = {
  getMyAssignedEvents,
  scanTicket,
  getEventAttendance,
  addTicketNote,
  getStaffDashboard
};