const Event = require('../models/Event');
const Ticket = require('../models/Ticket');
const User = require('../models/User');

// Get the list of events assigned to staff with fallback
const getMyAssignedEvents = async (req, res) => {
  try {
    const staffId = req.user._id;

    console.log('👤 Fetching assigned events for staff:', staffId);

    // Primary query based on direct assignment in Event.assignedStaff array
    let events = await Event.find({
      assignedStaff: staffId,
      status: 'published',
    })
      .populate('host', 'firstName lastName email')
      .select('title description startDateTime endDateTime location capacity ticketsSold status')
      .sort({ startDateTime: 1 });

    console.log(`📋 Found ${events.length} events via assignedStaff query`);

    // Fallback query: using user's profile assignedEvents list
    if (events.length === 0) {
      console.log('🔄 Trying fallback method via user profile...');
      const staffUser = await User.findById(staffId).select('staffProfile.assignedEvents');
      if (staffUser?.staffProfile?.assignedEvents?.length) {
        events = await Event.find({
          _id: { $in: staffUser.staffProfile.assignedEvents },
          status: 'published',
        })
          .populate('host', 'firstName lastName email')
          .select('title description startDateTime endDateTime location capacity ticketsSold status')
          .sort({ startDateTime: 1 });

        console.log(`📋 Found ${events.length} events via user profile fallback`);
      }
    }

    // Calculate stats per event
    const eventsWithStats = await Promise.all(
      events.map(async (event) => {
        const totalTickets = await Ticket.countDocuments({ eventId: event._id, status: 'active' });
        const scannedTickets = await Ticket.countDocuments({ eventId: event._id, 'verification.isScanned': true });

        return {
          ...event.toObject(),
          stats: {
            totalTickets,
            scannedTickets,
            unscannedTickets: totalTickets - scannedTickets,
            scanPercentage: totalTickets ? ((scannedTickets / totalTickets) * 100).toFixed(2) : '0.00',
          },
        };
      })
    );

    console.log(`✅ Returning ${eventsWithStats.length} events with stats`);

    res.status(200).json({
      success: true,
      count: eventsWithStats.length,
      events: eventsWithStats,
    });
  } catch (error) {
    console.error('❌ Get assigned events error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch assigned events',
      error: error.message,
    });
  }
};

// Scan ticket - mark scanned/checked in
const scanTicket = async (req, res) => {
  try {
    const { ticketNumber, qrCodeData, eventId, action = 'entry' } = req.body;
    const staffId = req.user._id;

    if (!ticketNumber && !qrCodeData) {
      return res.status(400).json({ success: false, message: 'Ticket number or QR code required' });
    }

    let query = {};
    if (ticketNumber) query.ticketNumber = ticketNumber;
    else if (qrCodeData) query.qrCodeData = qrCodeData;
    if (eventId) query.eventId = eventId;

    const ticket = await Ticket.findOne(query)
      .populate('eventId', 'assignedStaff title startDateTime endDateTime')
      .populate('attendeeId', 'firstName lastName email');

    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }

    if (!ticket.eventId.assignedStaff.some((id) => id.toString() === staffId.toString())) {
      return res.status(403).json({ success: false, message: 'You are not assigned to this event' });
    }

    if (ticket.status !== 'active') {
      return res.status(400).json({ success: false, message: `Ticket status ${ticket.status} invalid for scanning` });
    }

    const now = new Date();
    const eventStart = new Date(ticket.eventId.startDateTime);
    const eventEnd = new Date(ticket.eventId.endDateTime);

    if (action === 'entry' && now < eventStart) {
      return res.status(400).json({ success: false, message: 'Event has not started' });
    }

    if (now > eventEnd) {
      return res.status(400).json({ success: false, message: 'Event has ended' });
    }

    if (!ticket.verification) ticket.verification = {};

    if (action === 'entry') {
      if (ticket.verification.isScanned) {
        ticket.verification.scanCount = (ticket.verification.scanCount || 1) + 1;
      } else {
        ticket.verification.isScanned = true;
        ticket.verification.scannedAt = now;
        ticket.verification.scannedBy = staffId;
        ticket.verification.entryTime = now;
        ticket.verification.scanCount = 1;
      }
    } else if (action === 'exit') {
      if (!ticket.verification.isScanned) {
        return res.status(400).json({ success: false, message: 'Cannot record exit for unscanned ticket' });
      }
      ticket.verification.exitTime = now;
    }

    await ticket.save();

    // Emit real-time event using global socket function
    if (global.emitToEvent) {
      global.emitToEvent(eventId, 'attendee_checked_in', {
        eventId,
        eventTitle: ticket.eventId.title,
        attendeeName: `${ticket.attendeeId.firstName} ${ticket.attendeeId.lastName}`,
        ticketNumber: ticket.ticketNumber,
        scannedBy: ticket.verification.scannedBy,
        scannedAt: ticket.verification.scannedAt,
        scannerRole: 'event_staff', // adjust as needed
      });
    } else {
      console.warn('Global emitToEvent not available');
    }

    res.status(200).json({
      success: true,
      message: `Ticket ${action} recorded successfully`,
      data: {
        ticketNumber: ticket.ticketNumber,
        attendee: {
          name: `${ticket.attendeeId.firstName} ${ticket.attendeeId.lastName}`,
          email: ticket.attendeeId.email,
        },
        event: {
          title: ticket.eventId.title,
          startDateTime: ticket.eventId.startDateTime,
        },
        verification: ticket.verification,
        scanCount: ticket.verification.scanCount,
        isFirstScan: ticket.verification.scanCount === 1,
      },
    });
  } catch (error) {
    console.error('Scan ticket error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to scan ticket',
      error: error.message,
    });
  }
};

// Get attendance details for event
const getEventAttendance = async (req, res) => {
  try {
    const { eventId } = req.params;
    const staffId = req.user._id;

    const event = await Event.findById(eventId).populate('host', 'firstName lastName email');
    if (!event) {
      return res.status(404).json({ success: false, message: 'Event not found' });
    }

    if (!event.assignedStaff.some((id) => id.toString() === staffId.toString())) {
      return res.status(403).json({ success: false, message: 'You are not assigned to this event' });
    }

    const tickets = await Ticket.find({ eventId, status: 'active' })
      .populate('attendeeId', 'firstName lastName email')
      .sort({ 'verification.scannedAt': -1 });

    const totalTickets = tickets.length;
    const scannedTickets = tickets.filter((t) => t.verification?.isScanned).length;
    const unscannedTickets = totalTickets - scannedTickets;
    const attendanceRate = totalTickets ? ((scannedTickets / totalTickets) * 100).toFixed(2) : '0.00';

    const recentScans = tickets.filter((t) => t.verification?.isScanned).slice(0, 10);

    res.status(200).json({
      success: true,
      event: {
        id: event._id,
        title: event.title,
        startDateTime: event.startDateTime,
        endDateTime: event.endDateTime,
        location: event.location,
        host: event.host,
      },
      statistics: {
        totalTickets,
        scannedTickets,
        unscannedTickets,
        attendanceRate,
      },
      recentScans,
      allTickets: tickets.map((ticket) => ({
        _id: ticket._id,
        ticketNumber: ticket.ticketNumber,
        attendee: ticket.attendeeId,
        verification: ticket.verification,
        pricePaid: ticket.pricePaid,
        bookingDate: ticket.createdAt,
      })),
    });
  } catch (error) {
    console.error('Get attendance error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch attendance',
      error: error.message,
    });
  }
};

// Add note to ticket
const addTicketNote = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { note } = req.body;
    const staffId = req.user._id;

    if (!note || !note.trim()) {
      return res.status(400).json({ success: false, message: 'Note content is required' });
    }

    const ticket = await Ticket.findById(ticketId);
    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }

    if (!ticket.eventId) {
      return res.status(400).json({ success: false, message: 'Ticket event not found' });
    }

    // Check if staff assigned
    const assigned = await Event.findOne({
      _id: ticket.eventId,
      assignedStaff: staffId,
    });
    if (!assigned) {
      return res.status(403).json({ success: false, message: 'You are not assigned to this event' });
    }

    ticket.staffNotes = ticket.staffNotes || [];
    ticket.staffNotes.push({
      staffId,
      note: note.trim(),
      createdAt: new Date(),
    });

    await ticket.save();

    res.status(200).json({ success: true, message: 'Note added successfully' });
  } catch (error) {
    console.error('Add ticket note error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add note',
      error: error.message,
    });
  }
};

// Staff dashboard data
const getStaffDashboard = async (req, res) => {
  try {
    const staffId = req.user._id;

    console.log('📊 Fetching staff dashboard for:', staffId);

    let assignedEvents = await Event.find({
      assignedStaff: staffId,
      status: 'published',
    }).sort({ startDateTime: 1 });

    if (assignedEvents.length === 0) {
      const staffUser = await User.findById(staffId);
      if (staffUser?.staffProfile?.assignedEvents?.length) {
        assignedEvents = await Event.find({
          _id: { $in: staffUser.staffProfile.assignedEvents },
          status: 'published',
        }).sort({ startDateTime: 1 });
      }
    }

    console.log(`📋 Found ${assignedEvents.length} assigned events`);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const todaysEvents = assignedEvents.filter((event) => {
      const eventDate = new Date(event.startDateTime);
      return eventDate >= today && eventDate < tomorrow;
    });

    const nextWeek = new Date(today);
    nextWeek.setDate(nextWeek.getDate() + 7);

    const upcomingEvents = assignedEvents.filter((event) => {
      const eventDate = new Date(event.startDateTime);
      return eventDate >= today && eventDate <= nextWeek;
    });

    const totalScans = await Ticket.countDocuments({
      'verification.scannedBy': staffId,
    });

    console.log(`📊 Dashboard stats: ${assignedEvents.length} assigned, ${todaysEvents.length} today, ${upcomingEvents.length} upcoming, ${totalScans} total scans`);

    res.status(200).json({
      success: true,
      dashboard: {
        assignedEventsCount: assignedEvents.length,
        todaysEventsCount: todaysEvents.length,
        upcomingEventsCount: upcomingEvents.length,
        totalScans,
        todaysEvents: todaysEvents.slice(0, 3),
        upcomingEvents: upcomingEvents.slice(0, 5),
      },
      assignedEvents,
    });
  } catch (error) {
    console.error('Get staff dashboard error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch dashboard data',
      error: error.message,
    });
  }
};

module.exports = {
  getMyAssignedEvents,
  scanTicket,
  getEventAttendance,
  addTicketNote,
  getStaffDashboard,
};
