// backend/controllers/eventHostController.js - COMPLETE FILE WITH SUPABASE AND SCAN-TICKET

const Event = require('../models/Event');
const User = require('../models/User');
const Ticket = require('../models/Ticket');

// REPLACE CLOUDINARY WITH SUPABASE
const { uploadFile, deleteFile } = require('../services/supabaseService');

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

// @desc    Get single event by ID
// @route   GET /api/host/events/:id
// @access  Private (host only)
const getEventById = async (req, res) => {
  try {
    const eventId = req.params.id;
    const hostId = req.user._id;

    const event = await Event.findOne({ _id: eventId, host: hostId })
      .populate('host', 'firstName lastName email')
      .populate('assignedStaff', 'firstName lastName email phone selectedRole');

    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Event not found or you are not authorized to access it'
      });
    }

    // Get ticket statistics
    const totalTickets = await Ticket.countDocuments({ eventId: event._id });
    const checkedInTickets = await Ticket.countDocuments({ 
      eventId: event._id, 
      'checkInStatus.isCheckedIn': true 
    });

    const eventWithStats = {
      ...event.toObject(),
      statistics: {
        totalTicketsSold: totalTickets,
        checkedInAttendees: checkedInTickets,
        revenue: totalTickets * (event.pricing.isFree ? 0 : event.pricing.price),
        availableTickets: event.capacity - totalTickets
      }
    };

    res.status(200).json({
      success: true,
      event: eventWithStats
    });
  } catch (error) {
    console.error('Get event by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching event',
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

    // ========== SUPABASE IMAGE UPLOAD (CHANGED) ==========
    let bannerImageUrl = '';
    let imagePath = '';

    if (req.file) {
      console.log('📸 Uploading banner image to Supabase...');
      
      const uploadResult = await uploadFile(
        req.file.buffer,        // Buffer from multer memory storage
        req.file.originalname,  // Original filename
        'events'                // Folder in Supabase bucket
      );

      if (!uploadResult.success) {
        return res.status(400).json({
          success: false,
          message: 'Failed to upload banner image: ' + uploadResult.error
        });
      }

      bannerImageUrl = uploadResult.url;
      imagePath = uploadResult.path;
      
      console.log('✅ Banner image uploaded to Supabase:', bannerImageUrl);
    } else {
      // Use default placeholder image if no file uploaded
      bannerImageUrl = 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=1200&h=600&fit=crop';
    }

    // Add image URL and path to event data
    eventData.bannerImageUrl = bannerImageUrl;
    eventData.bannerImagePath = imagePath; // Store path for deletion later
    // ========== END SUPABASE UPLOAD ==========

    // Create event
    const event = new Event(eventData);
    await event.save();

    // ✅ CRITICAL: If staff are assigned during creation, update their profiles
    if (assignedStaff.length > 0) {
      console.log(`👥 Updating ${assignedStaff.length} staff profiles with new event assignment`);
      
      for (const staffId of assignedStaff) {
        if (staffId) {
          await User.findByIdAndUpdate(staffId, {
            $addToSet: { 'staffProfile.assignedEvents': event._id }
          }).catch(err => {
            console.warn(`⚠️ Failed to update staff ${staffId} profile:`, err.message);
          });

          // ✅ SOCKET.IO: Notify staff of new assignment using global function
          if (global.emitToUser) {
            global.emitToUser(staffId, 'staff_assigned', {
              eventId: event._id,
              eventTitle: event.title,
              staffId,
              message: `You've been assigned to ${event.title}`,
              assignedBy: req.user.firstName + ' ' + req.user.lastName
            });
          }
        }
      }
    }

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

    // ========== SUPABASE IMAGE UPLOAD (CHANGED) ==========
    if (req.file) {
      console.log('📸 Uploading new banner image to Supabase...');
      
      const uploadResult = await uploadFile(
        req.file.buffer,
        req.file.originalname,
        'events'
      );

      if (uploadResult.success) {
        updateData.bannerImageUrl = uploadResult.url;
        updateData.bannerImagePath = uploadResult.path;
        
        // Delete old image from Supabase (if exists and not default)
        if (event.bannerImagePath && !event.bannerImageUrl.includes('unsplash.com')) {
          console.log('🗑️ Deleting old banner image from Supabase...');
          await deleteFile(event.bannerImagePath).catch(err => {
            console.warn('⚠️ Failed to delete old image:', err.message);
          });
        }
        
        console.log('✅ New banner image uploaded to Supabase:', uploadResult.url);
      } else {
        console.warn('⚠️ Failed to upload new image, keeping existing one');
      }
    }
    // ========== END SUPABASE UPLOAD ==========

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

    // ✅ SOCKET.IO: Notify all staff assigned to this event of the update using global function
    if (global.emitToEvent) {
      global.emitToEvent(eventId, 'event_updated', {
        eventId,
        eventTitle: updatedEvent.title,
        message: `Event "${updatedEvent.title}" has been updated`,
        updatedBy: req.user.firstName + ' ' + req.user.lastName
      });
    }

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

    // ✅ CRITICAL: Remove event from all assigned staff profiles before deletion
    if (event.assignedStaff && event.assignedStaff.length > 0) {
      console.log(`🗑️ Removing event ${eventId} from ${event.assignedStaff.length} staff profiles`);
      
      for (const staffId of event.assignedStaff) {
        await User.findByIdAndUpdate(staffId, {
          $pull: { 'staffProfile.assignedEvents': eventId }
        }).catch(err => {
          console.warn(`⚠️ Failed to remove event from staff ${staffId} profile:`, err.message);
        });

        // ✅ SOCKET.IO: Notify staff of removal using global function
        if (global.emitToUser) {
          global.emitToUser(staffId, 'staff_removed', {
            eventId,
            eventTitle: event.title,
            staffId,
            message: `You've been removed from ${event.title}`,
            removedBy: req.user.firstName + ' ' + req.user.lastName
          });
        }
      }
    }

    // ========== DELETE IMAGE FROM SUPABASE (CHANGED) ==========
    if (event.bannerImagePath && !event.bannerImageUrl.includes('unsplash.com')) {
      console.log('🗑️ Deleting event banner image from Supabase...');
      await deleteFile(event.bannerImagePath).catch(err => {
        console.warn('⚠️ Failed to delete image from Supabase:', err.message);
      });
    }
    // ========== END SUPABASE DELETE ==========

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

    console.log('📋 Fetching attendees for event:', eventId);

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

    console.log(`✅ Found ${tickets.length} tickets for event ${eventId}`);

    // ✅ FIXED: Safe check-in status calculation
    const attendeesStats = {
      total: tickets.length,
      checkedIn: tickets.filter(t => t.checkInStatus?.isCheckedIn === true).length,
      notCheckedIn: tickets.filter(t => !t.checkInStatus?.isCheckedIn).length,
      cancelled: tickets.filter(t => t.status === 'cancelled').length
    };

    console.log('📊 Attendee stats:', attendeesStats);

    res.status(200).json({
      success: true,
      event: {
        id: event._id,
        title: event.title,
        startDateTime: event.startDateTime,
        capacity: event.capacity
      },
      stats: attendeesStats,
      // ✅ FIXED: Return attendees in the expected format for frontend
      attendees: tickets.map(ticket => ({
        _id: ticket._id,
        ticketId: ticket._id,
        ticketNumber: ticket.ticketNumber,
        attendee: ticket.attendeeId, // This contains the populated user data
        bookingDate: ticket.bookingDate,
        pricePaid: ticket.pricePaid,
        status: ticket.status,
        paymentStatus: ticket.paymentStatus,
        // ✅ CRITICAL: Ensure checkInStatus is properly mapped
        checkInStatus: {
          isCheckedIn: ticket.checkInStatus?.isCheckedIn || false,
          checkInTime: ticket.checkInStatus?.checkInTime || null,
          scannedBy: ticket.checkInStatus?.scannedBy || null
        },
        // Keep legacy format for backward compatibility
        checkIn: {
          isCheckedIn: ticket.checkInStatus?.isCheckedIn || false,
          checkInTime: ticket.checkInStatus?.checkInTime || null,
          checkedInBy: ticket.checkInStatus?.scannedBy || null
        },
        specialRequirements: ticket.attendeeInfo?.specialRequirements
      }))
    });
  } catch (error) {
    console.error('❌ Get event attendees error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching attendees',
      error: error.message
    });
  }
};

// ✅ UPDATED SCAN-TICKET CONTROLLER FUNCTION WITH BOTH CHECK-IN AND VERIFICATION UPDATES
// @desc    Scan and verify ticket for check-in
// @route   POST /api/host/scan-ticket
// @access  Private (host only)
const scanTicket = async (req, res) => {
  try {
    const { eventId, ticketNumber, scannedBy } = req.body;
    const hostId = req.user._id;

    console.log('🎫 Host scanning ticket:', { eventId, ticketNumber, hostId, scannedBy });

    // Validate input
    if (!eventId || !ticketNumber) {
      return res.status(400).json({
        success: false,
        message: 'Event ID and ticket number are required'
      });
    }

    // Verify event belongs to this host
    const event = await Event.findOne({ _id: eventId, host: hostId });
    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Event not found or access denied'
      });
    }

    // Find the ticket
    const ticket = await Ticket.findOne({
      eventId: eventId,
      ticketNumber: ticketNumber.trim()
    }).populate('attendeeId', 'firstName lastName email phone');

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }

    // Check ticket status
    if (ticket.status === 'cancelled') {
      return res.status(400).json({
        success: false,
        message: 'This ticket has been cancelled'
      });
    }

    if (ticket.status !== 'active' && ticket.status !== 'confirmed') {
      return res.status(400).json({
        success: false,
        message: 'Invalid ticket status'
      });
    }

    // Check if already checked in
    if (ticket.checkInStatus?.isCheckedIn) {
      return res.status(400).json({
        success: false,
        message: `Ticket already used on ${new Date(ticket.checkInStatus.checkInTime).toLocaleDateString()}`,
        ticket: {
          ...ticket.toObject(),
          attendee: ticket.attendeeId
        }
      });
    }

    // Check event date (optional - allow early check-in up to 2 hours before)
    const eventDate = new Date(event.startDateTime);
    const now = new Date();
    const timeDiff = eventDate.getTime() - now.getTime();
    const hoursDiff = timeDiff / (1000 * 3600);

    // Allow check-in up to 2 hours before event
    if (hoursDiff > 2) {
      return res.status(400).json({
        success: false,
        message: `Check-in not yet available. Event starts in ${Math.ceil(hoursDiff)} hours.`
      });
    }

    // ✅ CRITICAL: Update BOTH checkInStatus AND verification fields for consistency
    const scanTime = new Date();
    const scannerUserId = scannedBy || hostId;

    // Update checkInStatus (primary check-in info)
    ticket.checkInStatus = {
      isCheckedIn: true,
      checkInTime: scanTime,
      scannedBy: scannerUserId,
      scannerRole: 'event_host',
      scannerName: req.user.firstName + ' ' + req.user.lastName
    };

    // Update verification (detailed scan tracking)
    if (!ticket.verification) {
      ticket.verification = {};
    }
    
    ticket.verification = {
      isScanned: true,
      scannedAt: scanTime,
      scannedBy: scannerUserId,
      entryTime: scanTime,
      scanCount: (ticket.verification.scanCount || 0) + 1
    };

    await ticket.save();

    console.log('✅ Ticket checked in successfully by host:', ticketNumber);
    console.log('✅ Updated checkInStatus:', ticket.checkInStatus);
    console.log('✅ Updated verification:', ticket.verification);

    // ✅ SOCKET.IO: Emit real-time event using global function
    if (global.emitToEvent) {
      global.emitToEvent(eventId, 'attendee_checked_in', {
        eventId,
        eventTitle: event.title,
        attendeeName: `${ticket.attendeeId.firstName} ${ticket.attendeeId.lastName}`,
        ticketNumber: ticket.ticketNumber,
        scannedBy: ticket.checkInStatus.scannedBy,
        checkInTime: ticket.checkInStatus.checkInTime,
        scannerRole: 'event_host'
      });
      
      console.log(`🔊 Socket event emitted to event:${eventId}`);
    } else {
      console.warn('⚠️ Global emitToEvent function not available');
    }

    // Update event statistics (optional)
    try {
      await Event.findByIdAndUpdate(eventId, {
        $inc: { 'statistics.totalCheckIns': 1 }
      });
    } catch (statsError) {
      console.warn('Failed to update event stats:', statsError.message);
    }

    res.status(200).json({
      success: true,
      message: `Welcome ${ticket.attendeeId?.firstName || 'attendee'}! Check-in successful`,
      ticket: {
        ...ticket.toObject(),
        attendee: ticket.attendeeId
      }
    });

  } catch (error) {
    console.error('❌ Host ticket scan error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to scan ticket',
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
        const checkedIn = eventTickets.filter(t => t.checkInStatus?.isCheckedIn).length;

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
      .populate('attendeeId', 'firstName lastName email');

    // Calculate statistics
    const totalTickets = allTickets.length;
    const activeTickets = allTickets.filter(t => t.status === 'active').length;
    const cancelledTickets = allTickets.filter(t => t.status === 'cancelled').length;
    const checkedInTickets = allTickets.filter(t => t.checkInStatus?.isCheckedIn).length;
    const uncheckedTickets = activeTickets - checkedInTickets;

    // Revenue calculation
    const totalRevenue = allTickets
      .filter(t => t.status === 'active')
      .reduce((sum, ticket) => sum + ticket.pricePaid, 0);

    // Attendance by time (hourly breakdown for event day)
    const checkedInByHour = {};
    allTickets.forEach(ticket => {
      if (ticket.checkInStatus?.checkInTime) {
        const hour = new Date(ticket.checkInStatus.checkInTime).getHours();
        checkedInByHour[hour] = (checkedInByHour[hour] || 0) + 1;
      }
    });

    const recentCheckIns = allTickets
      .filter(t => t.checkInStatus?.isCheckedIn)
      .sort((a, b) => new Date(b.checkInStatus.checkInTime) - new Date(a.checkInStatus.checkInTime))
      .slice(0, 10)
      .map(ticket => ({
        attendee: `${ticket.attendeeId.firstName} ${ticket.attendeeId.lastName}`,
        checkInTime: ticket.checkInStatus.checkInTime,
        scannedBy: ticket.checkInStatus.scannedBy
      }));

    const staff = (event.assignedStaff || []).map(staff => ({
      name: `${staff.firstName} ${staff.lastName}`,
      email: staff.email,
      scansPerformed: allTickets.filter(t => 
        t.checkInStatus?.scannedBy?.toString() === staff._id.toString()
      ).length
    }));

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
          checkedInTickets,
          uncheckedTickets,
          capacityUtilization: ((totalTickets / event.capacity) * 100).toFixed(2),
          attendanceRate: activeTickets > 0 ? ((checkedInTickets / activeTickets) * 100).toFixed(2) : 0
        },
        revenue: {
          totalRevenue: totalRevenue / 100, // Convert from cents
          averageTicketPrice: activeTickets > 0 ? (totalRevenue / activeTickets / 100).toFixed(2) : 0
        },
        attendance: {
          checkedInByHour,
          recentCheckIns
        },
        staff
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

// ==================== STAFF MANAGEMENT FUNCTIONS ====================

// @desc    Get all available staff members
// @route   GET /api/host/available-staff
// @access  Private (host only)
const getAvailableStaff = async (req, res) => {
  try {
    console.log('📋 Fetching available staff members...');

    // Find all users with event_staff role
    const staffMembers = await User.find({ 
      selectedRole: 'event_staff' 
    }).select('firstName lastName email username phone staffProfile createdAt');

    console.log(`✅ Found ${staffMembers.length} staff members`);

    res.status(200).json({
      success: true,
      message: 'Staff members fetched successfully',
      staff: staffMembers,
      count: staffMembers.length
    });

  } catch (error) {
    console.error('❌ Get available staff error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch available staff',
      error: error.message
    });
  }
};

// ✅ CRITICAL FIX: Assign staff to event AND update staff profile
// @desc    Assign staff to event
// @route   POST /api/host/events/:id/assign-staff
// @access  Private (host only)
const assignStaffToEvent = async (req, res) => {
  try {
    const eventId = req.params.id;
    const { staffId } = req.body;
    const hostId = req.user._id;

    console.log(`👤 Assigning staff ${staffId} to event ${eventId}`);

    // Validate input
    if (!staffId) {
      return res.status(400).json({
        success: false,
        message: 'Staff ID is required'
      });
    }

    // Find event and verify ownership
    const event = await Event.findOne({ _id: eventId, host: hostId });
    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Event not found or you are not authorized'
      });
    }

    // Verify staff user exists and has correct role
    const staff = await User.findById(staffId);
    if (!staff || staff.selectedRole !== 'event_staff') {
      return res.status(400).json({
        success: false,
        message: 'Invalid staff member or user is not a staff'
      });
    }

    // Check if staff is already assigned
    if (event.assignedStaff.includes(staffId)) {
      return res.status(400).json({
        success: false,
        message: 'Staff member is already assigned to this event'
      });
    }

    // ✅ CRITICAL: Add staff to event AND update staff's assignedEvents
    event.assignedStaff.push(staffId);
    await event.save();

    // ✅ UPDATE STAFF USER'S ASSIGNED EVENTS
    await User.findByIdAndUpdate(staffId, {
      $addToSet: { 'staffProfile.assignedEvents': eventId }
    });

    console.log(`✅ Updated staff ${staffId} profile with event ${eventId}`);

    // ✅ SOCKET.IO: Notify staff of assignment using global function
    if (global.emitToUser) {
      global.emitToUser(staffId, 'staff_assigned', {
        eventId,
        eventTitle: event.title,
        staffId,
        message: `You've been assigned to ${event.title}`,
        assignedBy: req.user.firstName + ' ' + req.user.lastName
      });
    }

    // Populate and return updated event
    const updatedEvent = await Event.findById(eventId)
      .populate('assignedStaff', 'firstName lastName email phone');

    console.log(`✅ Staff assigned successfully to event ${eventId}`);

    res.status(200).json({
      success: true,
      message: 'Staff assigned successfully',
      event: updatedEvent
    });

  } catch (error) {
    console.error('❌ Assign staff error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to assign staff',
      error: error.message
    });
  }
};

// ✅ CRITICAL FIX: Remove staff from event AND update staff profile
// @desc    Remove staff from event
// @route   DELETE /api/host/events/:id/remove-staff/:staffId
// @access  Private (host only)
const removeStaffFromEvent = async (req, res) => {
  try {
    const { id: eventId, staffId } = req.params;
    const hostId = req.user._id;

    console.log(`🗑️ Removing staff ${staffId} from event ${eventId}`);

    // Find event and verify ownership
    const event = await Event.findOne({ _id: eventId, host: hostId });
    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Event not found or you are not authorized'
      });
    }

    // Check if staff is assigned
    if (!event.assignedStaff.includes(staffId)) {
      return res.status(400).json({
        success: false,
        message: 'Staff member is not assigned to this event'
      });
    }

    // ✅ CRITICAL: Remove staff from event AND update staff's assignedEvents
    event.assignedStaff = event.assignedStaff.filter(
      id => id.toString() !== staffId.toString()
    );
    await event.save();

    // ✅ UPDATE STAFF USER'S ASSIGNED EVENTS
    await User.findByIdAndUpdate(staffId, {
      $pull: { 'staffProfile.assignedEvents': eventId }
    });

    console.log(`✅ Removed event ${eventId} from staff ${staffId} profile`);

    // ✅ SOCKET.IO: Notify staff of removal using global function
    if (global.emitToUser) {
      global.emitToUser(staffId, 'staff_removed', {
        eventId,
        eventTitle: event.title,
        staffId,
        message: `You've been removed from ${event.title}`,
        removedBy: req.user.firstName + ' ' + req.user.lastName
      });
    }

    // Populate and return updated event
    const updatedEvent = await Event.findById(eventId)
      .populate('assignedStaff', 'firstName lastName email phone');

    console.log(`✅ Staff removed successfully from event ${eventId}`);

    res.status(200).json({
      success: true,
      message: 'Staff removed successfully',
      event: updatedEvent
    });

  } catch (error) {
    console.error('❌ Remove staff error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to remove staff',
      error: error.message
    });
  }
};

// ✅ EXPORT ALL FUNCTIONS INCLUDING UPDATED SCAN-TICKET WITH DUAL FIELD UPDATES
module.exports = {
  getMyEvents,
  getEventById,
  createEvent,
  updateEvent,
  deleteEvent,
  getEventAttendees,
  scanTicket, // ✅ UPDATED SCAN-TICKET FUNCTION WITH BOTH CHECK-IN AND VERIFICATION UPDATES
  getHostAnalytics,
  getEventAnalytics,
  getAvailableStaff,
  assignStaffToEvent,
  removeStaffFromEvent
};
