const User = require('../models/User');

// @desc    Complete onboarding by selecting user role
// @route   POST /api/onboarding/select-role
// @access  Private
const completeOnboarding = async (req, res) => {
  try {
    console.log('🎯 Onboarding completion for user:', req.user._id);

    const { role, profileData } = req.body;
    const userId = req.user._id;

    // Validate role
    const validRoles = ['event_host', 'event_attendee', 'event_staff'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid role selected. Valid roles: ' + validRoles.join(', ')
      });
    }

    const updateData = { 
      selectedRole: role,
      onboardingCompleted: true // Mark onboarding as completed
    };

    // Handle role-specific profile data
    if (role === 'event_host' && profileData) {
      updateData.hostProfile = {
        organizationName: profileData.organizationName || '',
        organizationDescription: profileData.organizationDescription || '',
        website: profileData.website || '',
        verified: false // New hosts need verification
      };
    } else if (role === 'event_staff' && profileData) {
      updateData.staffProfile = {
        permissions: profileData.permissions || ['scan_ticket', 'check_in_attendee'],
        assignedEvents: [],
        isActive: true
      };
    } else if (role === 'event_attendee') {
      updateData.attendeeProfile = {
        preferences: profileData?.preferences || [],
        favoriteCategories: profileData?.favoriteCategories || []
      };
    }

    // Update user with onboarding completion
    const user = await User.findByIdAndUpdate(
      userId,
      updateData,
      { new: true, select: '-password' }
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    console.log('✅ Onboarding completed for role:', role);

    res.status(200).json({
      success: true,
      message: `Onboarding completed! Welcome as ${role.replace('_', ' ')}`,
      user: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        username: user.username,
        selectedRole: user.selectedRole,
        onboardingCompleted: user.onboardingCompleted,
        hostProfile: user.hostProfile,
        staffProfile: user.staffProfile,
        attendeeProfile: user.attendeeProfile,
        createdAt: user.createdAt
      },
      redirectTo: getRedirectPath(role)
    });
  } catch (error) {
    console.error('❌ Onboarding error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during onboarding completion',
      error: error.message
    });
  }
};

// @desc    Get onboarding status for user
// @route   GET /api/onboarding/status
// @access  Private
const getOnboardingStatus = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.status(200).json({
      success: true,
      onboardingCompleted: user.onboardingCompleted || false,
      selectedRole: user.selectedRole,
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        selectedRole: user.selectedRole,
        onboardingCompleted: user.onboardingCompleted
      }
    });
  } catch (error) {
    console.error('❌ Get onboarding status error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching onboarding status',
      error: error.message
    });
  }
};

// Helper function to determine redirect path based on role
const getRedirectPath = (role) => {
  switch (role) {
    case 'event_host':
      return '/organizer-dashboard';
    case 'event_staff':
      return '/staff-dashboard';
    case 'event_attendee':
    default:
      return '/my-bookings';
  }
};

module.exports = {
  completeOnboarding,
  getOnboardingStatus
};
