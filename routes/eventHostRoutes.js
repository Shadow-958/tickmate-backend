const express = require('express');
const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const { cloudinary } = require('../cloudConfig');

const { 
  getMyEvents,
  createEvent,
  updateEvent,
  deleteEvent,
  getEventAttendees,
  getHostAnalytics
} = require('../controllers/eventHostController');

const { authenticate, authorize } = require('../middleware/authMiddleware');

const router = express.Router();

// Configure multer for image uploads
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'event-banners',
    allowedFormats: ['png', 'jpg', 'jpeg', 'webp'],
    transformation: [{ width: 1200, height: 400, crop: 'fill' }]
  }
});

const upload = multer({ 
  storage,
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

// All routes require authentication and event_host role
router.use(authenticate);
router.use(authorize('event_host'));

// @route   GET /api/host/my-events
// @desc    Get all events created by the host
// @access  Private (host only)
router.get('/my-events', getMyEvents);

// @route   POST /api/host/events
// @desc    Create new event
// @access  Private (host only)
router.post('/events', upload.single('bannerImage'), createEvent);

// @route   PUT /api/host/events/:id
// @desc    Update event
// @access  Private (host only)
router.put('/events/:id', upload.single('bannerImage'), updateEvent);

// @route   DELETE /api/host/events/:id
// @desc    Delete event
// @access  Private (host only)
router.delete('/events/:id', deleteEvent);

// @route   GET /api/host/events/:id/attendees
// @desc    Get event attendees
// @access  Private (host only)
router.get('/events/:id/attendees', getEventAttendees);

// @route   GET /api/host/analytics
// @desc    Get host analytics
// @access  Private (host only)
router.get('/analytics', getHostAnalytics);

// Error handling for multer
router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'File size too large. Maximum size is 5MB.'
      });
    }
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