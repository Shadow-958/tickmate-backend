const jwt = require('jsonwebtoken');
const User = require('../models/User');

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-key';

// Authentication middleware - verifies JWT token
const authenticate = async (req, res, next) => {
  try {
    // Log all headers (for debugging)
    console.log('Received Headers:', req.headers);

    // Case-insensitive header retrieval
    const authHeader = req.headers['authorization'] || req.headers['Authorization'];

    console.log('Authorization Header:', authHeader); // Debug log

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. No token provided in Authorization header.',
      });
    }

    const token = authHeader.slice(7).trim();

    console.log('Extracted Token:', token); // Debug log

    const decoded = jwt.verify(token, JWT_SECRET);

    const user = await User.findById(decoded.id).select('-password');

    if (!user || !user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Invalid token or user not active.',
      });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('Authentication Error:', error);
    res.status(401).json({
      success: false,
      message: 'Invalid token.',
      error: error.message,
    });
  }
};

// Role-based authorization middleware
const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required.',
      });
    }

    if (!allowedRoles.includes(req.user.selectedRole)) {
      return res.status(403).json({
        success: false,
        message: `Access denied. Required roles: ${allowedRoles.join(', ')}. Your role: ${req.user.selectedRole}`,
      });
    }

    next();
  };
};

// Permission-based authorization middleware
const requirePermissions = (...requiredPermissions) => {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required.',
      });
    }

    // Define role permissions
    const rolePermissions = {
      event_host: [
        'create_event',
        'edit_event',
        'delete_event',
        'view_event_analytics',
        'manage_event_capacity',
        'view_attendees_list',
        'export_attendee_data',
      ],
      event_attendee: [
        'view_events',
        'book_ticket',
        'view_my_tickets',
        'cancel_booking',
        'download_ticket',
      ],
      event_staff: [
        'scan_ticket',
        'check_in_attendee',
        'view_event_attendees',
        'verify_ticket_validity',
        'mark_attendance',
      ],
    };

    const userPermissions = rolePermissions[req.user.selectedRole] || [];

    // Check if all required permissions are present
    const hasAllPermissions = requiredPermissions.every((perm) =>
      userPermissions.includes(perm)
    );

    if (!hasAllPermissions) {
      return res.status(403).json({
        success: false,
        message: `Access denied. Required permissions: ${requiredPermissions.join(', ')}`,
      });
    }

    next();
  };
};

// Resource ownership middleware (for verifying resource ownership)
const requireOwnership = (resourceModel, resourceIdParam = 'id') => {
  return async (req, res, next) => {
    try {
      const resourceId = req.params[resourceIdParam];
      const resource = await resourceModel.findById(resourceId);

      if (!resource) {
        return res.status(404).json({
          success: false,
          message: 'Resource not found.',
        });
      }

      let isOwner = false;

      if (resource.host && resource.host.toString() === req.user._id.toString()) {
        isOwner = true; // Event ownership
      } else if (
        resource.attendeeId &&
        resource.attendeeId.toString() === req.user._id.toString()
      ) {
        isOwner = true; // Ticket ownership
      } else if (resource._id && resource._id.toString() === req.user._id.toString()) {
        isOwner = true; // User profile ownership
      }

      if (!isOwner) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. You can only access your own resources.',
        });
      }

      req.resource = resource;
      next();
    } catch (error) {
      console.error('Ownership Check Error:', error);
      res.status(500).json({
        success: false,
        message: 'Error checking resource ownership.',
        error: error.message,
      });
    }
  };
};

// Optional authentication middleware for public routes
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'] || req.headers['Authorization'];

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7).trim();
      const decoded = jwt.verify(token, JWT_SECRET);

      const user = await User.findById(decoded.id).select('-password');

      if (user && user.isActive) {
        req.user = user;
      }
    }

    next();
  } catch (error) {
    // Ignore errors, proceed without user info
    next();
  }
};

module.exports = {
  authenticate,
  authorize,
  requirePermissions,
  requireOwnership,
  optionalAuth,
};
