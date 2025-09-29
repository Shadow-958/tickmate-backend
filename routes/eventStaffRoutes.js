const express = require('express');
const { 
  getMyAssignedEvents,
  scanTicket,
  getEventAttendance,
  addTicketNote,
  getStaffDashboard
} = require('../controllers/eventStaffController');

const { authenticate, authorize } = require('../middleware/authMiddleware');

const router = express.Router();

// All routes require authentication and event_staff role
router.use(authenticate);
router.use(authorize('event_staff'));

// @route   GET /api/staff/dashboard
// @desc    Get staff dashboard data
// @access  Private (staff only)
router.get('/dashboard', getStaffDashboard);

// @route   GET /api/staff/my-events
// @desc    Get events assigned to this staff member
// @access  Private (staff only)
router.get('/my-events', getMyAssignedEvents);

// @route   POST /api/staff/scan-ticket
// @desc    Scan and verify ticket
// @access  Private (staff only)
router.post('/scan-ticket', scanTicket);

// @route   GET /api/staff/events/:eventId/attendance
// @desc    Get event attendance details
// @access  Private (staff only)
router.get('/events/:eventId/attendance', getEventAttendance);

// @route   POST /api/staff/tickets/:ticketId/note
// @desc    Add note to ticket
// @access  Private (staff only)
router.post('/tickets/:ticketId/note', addTicketNote);

module.exports = router;
