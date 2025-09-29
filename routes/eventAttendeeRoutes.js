const express = require('express');
const { 
  getAvailableEvents,
  getEventDetails,
  bookTicket,
  getMyTickets,
  cancelTicket,
  downloadTicket
} = require('../controllers/eventAttendeeController');

const { authenticate, authorize, optionalAuth } = require('../middleware/authMiddleware');

const router = express.Router();

// @route   GET /api/attendee/events
// @desc    Get all available events for attendees
// @access  Public (better with optional auth for personalization)
router.get('/events', optionalAuth, getAvailableEvents);

// @route   GET /api/attendee/events/:id
// @desc    Get single event details
// @access  Public (better with optional auth)
router.get('/events/:id', optionalAuth, getEventDetails);

// All routes below require authentication and event_attendee role
router.use(authenticate);
router.use(authorize('event_attendee'));

// @route   POST /api/attendee/book-ticket
// @desc    Book ticket for event
// @access  Private (attendee only)
router.post('/book-ticket', bookTicket);

// @route   GET /api/attendee/my-tickets
// @desc    Get user's tickets
// @access  Private (attendee only)
router.get('/my-tickets', getMyTickets);

// @route   DELETE /api/attendee/tickets/:ticketId
// @desc    Cancel ticket
// @access  Private (attendee only)
router.delete('/tickets/:ticketId', cancelTicket);

// @route   GET /api/attendee/tickets/:ticketId/download
// @desc    Download ticket
// @access  Private (attendee only)
router.get('/tickets/:ticketId/download', downloadTicket);

module.exports = router;