const Event = require('../models/Event');

// @desc    Get all events
const getAllEvents = async (req, res) => {
  try {
    const { category, search, limit = 50, page = 1 } = req.query;

    let query = {};

    // Filter by category if provided
    if (category && category !== 'all') {
      query.category = category;
    }

    // Search functionality
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    const events = await Event.find(query)
      .populate('host', 'firstName lastName')
      .sort({ startDateTime: 1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));

    const totalEvents = await Event.countDocuments(query);

    res.status(200).json({
      success: true,
      events,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalEvents / parseInt(limit)),
        totalEvents,
        hasNext: page * limit < totalEvents,
        hasPrev: page > 1
      }
    });
  } catch (error) {
    console.error('Get all events error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch events',
      error: error.message
    });
  }
};

// @desc    Get event by ID
const getEventById = async (req, res) => {
  try {
    const event = await Event.findById(req.params.id)
      .populate('host', 'firstName lastName username');

    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Event not found'
      });
    }

    res.status(200).json({
      success: true,
      event
    });
  } catch (error) {
    console.error('Get event by ID error:', error);

    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: 'Invalid event ID format'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to fetch event',
      error: error.message
    });
  }
};

// @desc    Get events by category
const getEventsByCategory = async (req, res) => {
  try {
    const { categoryId } = req.params;
    const { limit = 20, page = 1 } = req.query;

    const events = await Event.find({ category: categoryId })
      .populate('host', 'firstName lastName')
      .sort({ startDateTime: 1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));

    const totalEvents = await Event.countDocuments({ category: categoryId });

    res.status(200).json({
      success: true,
      events,
      category: categoryId,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalEvents / parseInt(limit)),
        totalEvents
      }
    });
  } catch (error) {
    console.error('Get events by category error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch events by category',
      error: error.message
    });
  }
};

// @desc    Create event (public route for authenticated users)
const createEventPublic = async (req, res) => {
  try {
    const {
      title,
      description,
      category,
      location,
      startDateTime,
      endDateTime,
      capacity,
      pricing
    } = req.body;

    // Basic validation
    if (!title || !description || !category || !startDateTime || !endDateTime || !capacity) {
      return res.status(400).json({
        success: false,
        message: 'Please provide all required fields'
      });
    }

    // Validate dates
    const start = new Date(startDateTime);
    const end = new Date(endDateTime);

    if (start >= end) {
      return res.status(400).json({
        success: false,
        message: 'End date must be after start date'
      });
    }

    if (start <= new Date()) {
      return res.status(400).json({
        success: false,
        message: 'Start date must be in the future'
      });
    }

    const newEvent = new Event({
      title,
      description,
      category,
      location,
      startDateTime: start,
      endDateTime: end,
      capacity: parseInt(capacity),
      pricing: {
        isFree: pricing?.isFree || false,
        price: pricing?.isFree ? 0 : (pricing?.price || 0)
      },
      host: req.user._id
    });

    const savedEvent = await newEvent.save();
    const populatedEvent = await Event.findById(savedEvent._id)
      .populate('host', 'firstName lastName username');

    res.status(201).json({
      success: true,
      message: 'Event created successfully',
      event: populatedEvent
    });
  } catch (error) {
    console.error('Create event error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create event',
      error: error.message
    });
  }
};

module.exports = {
  getAllEvents,
  getEventById,
  getEventsByCategory,
  createEventPublic
};
