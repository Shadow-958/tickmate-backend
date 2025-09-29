const express = require('express');
const { authenticate, optionalAuth } = require('../middleware/authMiddleware');
const {
  getAllEvents,
  getEventById,
  createEventPublic,
  getEventsByCategory
} = require('../controllers/eventsController');

const router = express.Router();

// @route   GET /api/events
// @desc    Get all public events
// @access  Public
router.get('/', optionalAuth, getAllEvents);

// @route   GET /api/events/:id
// @desc    Get single event details
// @access  Public
router.get('/:id', optionalAuth, getEventById);

// @route   GET /api/events/category/:categoryId
// @desc    Get events by category
// @access  Public
router.get('/category/:categoryId', optionalAuth, getEventsByCategory);

// @route   POST /api/events
// @desc    Create new event (alternative to /api/host/events)
// @access  Private (authenticated users)
router.post('/', authenticate, createEventPublic);

module.exports = router;
