const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-key';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

// Generate JWT token
const generateToken = (userId) => {
  return jwt.sign({ id: userId }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
};

// @desc    Register new user
// @route   POST /api/auth/register
// @access  Public
const register = async (req, res) => {
  try {
    console.log('📝 Register attempt:', { email: req.body.email, firstName: req.body.firstName });

    const { email, password, firstName, lastName, phone } = req.body;

    // Validation
    if (!email || !password || !firstName || !lastName) {
      return res.status(400).json({
        success: false,
        message: 'Please provide email, password, first name, and last name'
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters long'
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User already exists with this email'
      });
    }

    // Hash password
    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Generate unique username
    const baseUsername = `${firstName.toLowerCase()}_${lastName.toLowerCase()}`;
    let username = baseUsername;
    let counter = 1;

    while (await User.findOne({ username })) {
      username = `${baseUsername}${counter}`;
      counter++;
    }

    // Create user with default role
    const user = new User({
      email: email.toLowerCase(),
      password: hashedPassword,
      firstName,
      lastName,
      phone,
      username,
      selectedRole: 'event_attendee' // Default role
    });

    await user.save();
    console.log('✅ User created successfully:', user._id);

    // Generate token
    const token = generateToken(user._id);

    // Send response (excluding password)
    const userResponse = {
      id: user._id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      username: user.username,
      selectedRole: user.selectedRole,
      phone: user.phone,
      createdAt: user.createdAt
    };

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      token,
      user: userResponse
    });
  } catch (error) {
    console.error('❌ Registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during registration',
      error: error.message
    });
  }
};

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
const login = async (req, res) => {
  try {
    console.log('🔐 Login attempt:', { email: req.body.email });

    const { email, password } = req.body;

    // Validation
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide email and password'
      });
    }

    // Find user
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Check password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    console.log('✅ Login successful for:', user.email);

    // Generate token
    const token = generateToken(user._id);

    // Send response (excluding password)
    const userResponse = {
      id: user._id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      username: user.username,
      selectedRole: user.selectedRole,
      phone: user.phone,
      createdAt: user.createdAt
    };

    res.status(200).json({
      success: true,
      message: 'Login successful',
      token,
      user: userResponse
    });
  } catch (error) {
    console.error('❌ Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during login',
      error: error.message
    });
  }
};

// @desc    Select user role after login
// @route   POST /api/auth/select-role
// @access  Private
const selectRole = async (req, res) => {
  try {
    console.log('👤 Role selection for user:', req.user._id);

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

    const updateData = { selectedRole: role };

    // Handle role-specific profile data
    if (role === 'event_host' && profileData) {
      updateData.hostProfile = {
        organizationName: profileData.organizationName || '',
        organizationDescription: profileData.organizationDescription || '',
        website: profileData.website || ''
      };
    } else if (role === 'event_staff' && profileData) {
      updateData.staffProfile = {
        permissions: profileData.permissions || ['scan_ticket', 'check_in_attendee']
      };
    }

    // Update user role
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

    console.log('✅ Role updated to:', role);

    res.status(200).json({
      success: true,
      message: `Role updated successfully to ${role}`,
      user: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        username: user.username,
        selectedRole: user.selectedRole,
        hostProfile: user.hostProfile,
        staffProfile: user.staffProfile
      }
    });
  } catch (error) {
    console.error('❌ Role selection error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during role selection',
      error: error.message
    });
  }
};

// @desc    Get current user profile
// @route   GET /api/auth/me
// @access  Private
const getMe = async (req, res) => {
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
      user: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        username: user.username,
        selectedRole: user.selectedRole,
        phone: user.phone,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
      }
    });
  } catch (error) {
    console.error('❌ Get profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching profile',
      error: error.message
    });
  }
};

// @desc    Update user profile
// @route   PUT /api/auth/profile
// @access  Private
const updateProfile = async (req, res) => {
  try {
    const { firstName, lastName, phone, photo } = req.body;
    const userId = req.user._id;

    const updateData = {};
    if (firstName) updateData.firstName = firstName;
    if (lastName) updateData.lastName = lastName;
    if (phone) updateData.phone = phone;
    if (photo) updateData.photo = photo;

    const user = await User.findByIdAndUpdate(
      userId,
      updateData,
      { new: true, select: '-password' }
    );

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      user
    });
  } catch (error) {
    console.error('❌ Profile update error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error updating profile',
      error: error.message
    });
  }
};

module.exports = {
  register,
  login,
  selectRole,
  getMe,
  updateProfile
};