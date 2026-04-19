// backend/routes/attendeeRoutes.js - COMPLETE UPDATED FILE

const express = require('express');
const router = express.Router();

// Import middleware
const { authenticate, authorize, optionalAuth } = require('../middleware/authMiddleware');

// Import controller functions
const {
  getAvailableEvents,
  getEventDetails,
  bookTicket,
  getMyBookings,
  getMyTickets,
  getBookingDetails,
  cancelTicket,
  downloadTicket,
  getBookingStats
} = require('../controllers/eventAttendeeController');

// ==================== PUBLIC ROUTES ====================
// These routes can be accessed without authentication but work better with optional auth

// @route   GET /api/attendee/events
// @desc    Get all available events for attendees
// @access  Public (better with optional auth for personalization)
router.get('/events', optionalAuth, getAvailableEvents);

// @route   GET /api/attendee/events/:id
// @desc    Get single event details
// @access  Public (better with optional auth to check if user has ticket)
router.get('/events/:id', optionalAuth, getEventDetails);

// ==================== PROTECTED ROUTES ====================
// All routes below require authentication and event_attendee role

router.use(authenticate);
router.use(authorize('event_attendee'));

// ==================== BOOKING ROUTES ====================

// @route   POST /api/attendee/book-ticket
// @desc    Book ticket for event (free events only, paid events redirect to payment)
// @access  Private (attendee only)
router.post('/book-ticket', bookTicket);

// @route   GET /api/attendee/my-bookings
// @desc    Get all bookings/tickets for current user
// @access  Private (attendee only)
router.get('/my-bookings', getMyBookings);

// @route   GET /api/attendee/my-tickets
// @desc    Get user's tickets (alias for my-bookings with additional filters)
// @access  Private (attendee only)
router.get('/my-tickets', getMyTickets);

// @route   GET /api/attendee/stats
// @desc    Get booking statistics for current user
// @access  Private (attendee only)
router.get('/stats', getBookingStats);

// ==================== INDIVIDUAL TICKET ROUTES ====================

// @route   GET /api/attendee/bookings/:ticketId
// @desc    Get single booking/ticket details
// @access  Private (attendee only)
router.get('/bookings/:ticketId', getBookingDetails);

// @route   PUT /api/attendee/bookings/:ticketId/cancel
// @desc    Cancel a booking/ticket
// @access  Private (attendee only)
router.put('/bookings/:ticketId/cancel', cancelTicket);

// @route   GET /api/attendee/tickets/:ticketId/download
// @desc    Download ticket data (for PDF generation)
// @access  Private (attendee only)
router.get('/tickets/:ticketId/download', downloadTicket);

// Alternative route for cancellation (DELETE method)
// @route   DELETE /api/attendee/tickets/:ticketId
// @desc    Cancel ticket (alternative endpoint)
// @access  Private (attendee only)
router.delete('/tickets/:ticketId', (req, res) => {
  // Redirect to the cancel function
  req.params.ticketId = req.params.ticketId;
  cancelTicket(req, res);
});

module.exports = router;

console.log('🎫 Attendee routes loaded successfully');
