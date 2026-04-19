// backend/routes/eventHostRoutes.js - ADD SCAN-TICKET ROUTE

const express = require('express');
const multer = require('multer');

// Import controller functions
const { 
  getMyEvents,
  getEventById,
  createEvent,
  updateEvent,
  deleteEvent,
  getEventAttendees,
  getHostAnalytics,
  getEventAnalytics,
  getAvailableStaff,
  assignStaffToEvent,
  removeStaffFromEvent,
  scanTicket // ✅ ADD THIS
} = require('../controllers/eventHostController');

const { authenticate, authorize } = require('../middleware/authMiddleware');

const router = express.Router();

// ==================== MULTER CONFIGURATION FOR SUPABASE ====================
const storage = multer.memoryStorage();

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  }
});

// ==================== AUTHENTICATION MIDDLEWARE ====================
router.use(authenticate);
router.use(authorize('event_host'));

// ==================== EVENT MANAGEMENT ROUTES ====================

// @route   GET /api/host/my-events
// @desc    Get all events created by the host
// @access  Private (host only)
router.get('/my-events', getMyEvents);

// @route   GET /api/host/events/:id
// @desc    Get single event by ID
// @access  Private (host only)
router.get('/events/:id', getEventById);

// @route   POST /api/host/events
// @desc    Create new event with Supabase image upload
// @access  Private (host only)
router.post('/events', upload.single('bannerImage'), createEvent);

// @route   PUT /api/host/events/:id
// @desc    Update event with Supabase image upload
// @access  Private (host only)
router.put('/events/:id', upload.single('bannerImage'), updateEvent);

// @route   DELETE /api/host/events/:id
// @desc    Delete event (also removes image from Supabase)
// @access  Private (host only)
router.delete('/events/:id', deleteEvent);

// ==================== ATTENDEE MANAGEMENT ROUTES ====================

// @route   GET /api/host/events/:id/attendees
// @desc    Get event attendees
// @access  Private (host only)
router.get('/events/:id/attendees', getEventAttendees);

// ✅ ADD SCAN-TICKET ROUTE
// @route   POST /api/host/scan-ticket
// @desc    Scan and verify ticket for check-in
// @access  Private (host only)
router.post('/scan-ticket', scanTicket);

// ==================== ANALYTICS ROUTES ====================

// @route   GET /api/host/analytics
// @desc    Get host analytics (overview)
// @access  Private (host only)
router.get('/analytics', getHostAnalytics);

// @route   GET /api/host/events/:eventId/analytics
// @desc    Get detailed event analytics
// @access  Private (host only)
router.get('/events/:eventId/analytics', getEventAnalytics);

// ==================== STAFF MANAGEMENT ROUTES ====================

// @route   GET /api/host/available-staff
// @desc    Get all available staff members
// @access  Private (host only)
router.get('/available-staff', getAvailableStaff);

// @route   POST /api/host/events/:id/assign-staff
// @desc    Assign staff member to event
// @access  Private (host only)
router.post('/events/:id/assign-staff', assignStaffToEvent);

// @route   DELETE /api/host/events/:id/remove-staff/:staffId
// @desc    Remove staff member from event
// @access  Private (host only)
router.delete('/events/:id/remove-staff/:staffId', removeStaffFromEvent);

// ==================== ERROR HANDLING ====================

// Error handling for multer
router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'File size too large. Maximum size is 5MB.'
      });
    }
    
    return res.status(400).json({
      success: false,
      message: `Upload error: ${error.message}`
    });
  }

  if (error.message === 'Only image files are allowed') {
    return res.status(400).json({
      success: false,
      message: 'Only image files are allowed for event banners.'
    });
  }

  next(error);
});

module.exports = router;
