const express = require('express');
const { 
  completeOnboarding, 
  getOnboardingStatus 
} = require('../controllers/onboardingController');
const { authenticate } = require('../middleware/authMiddleware');

const router = express.Router();

// @route   POST /api/onboarding/select-role
// @desc    Complete onboarding by selecting role
// @access  Private
router.post('/select-role', authenticate, completeOnboarding);

// @route   GET /api/onboarding/status
// @desc    Get user's onboarding status
// @access  Private
router.get('/status', authenticate, getOnboardingStatus);

module.exports = router;
