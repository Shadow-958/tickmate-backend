// backend/server.js - COMPLETE FILE WITH SOCKET.IO

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const jwt = require('jsonwebtoken');

// Load environment variables
dotenv.config();

// Import models for Socket.IO authentication
const User = require('./models/User');

// Import routes
const authRoutes = require('./routes/authRoutes');
const eventHostRoutes = require('./routes/eventHostRoutes');
const eventAttendeeRoutes = require('./routes/eventAttendeeRoutes');
const eventStaffRoutes = require('./routes/eventStaffRoutes');
const demoPaymentRoutes = require('./routes/paymentRoutes');
const onboardingRoutes = require('./routes/onBoardingRoutes');
const eventsRoutes = require('./routes/eventsRoutes');

const app = express();
const PORT = process.env.PORT || 10000;
const FRONTEND_URLS = (process.env.FRONTEND_URL ||
  'http://localhost:5173,http://tickmate-v2.s3-website-us-east-1.amazonaws.com')
  .split(',')
  .map((url) => url.trim())
  .filter(Boolean);
const ALLOWED_ORIGINS = new Set(FRONTEND_URLS);

const corsOptions = {
  origin: (origin, callback) => {
    // Allow non-browser requests (curl, health checks, server-to-server)
    if (!origin) {
      return callback(null, true);
    }

    if (ALLOWED_ORIGINS.has(origin)) {
      return callback(null, true);
    }

    return callback(new Error(`CORS blocked for origin: ${origin}`));
  },
  credentials: true,
  allowedHeaders: ["Authorization", "Content-Type", "Origin", "Accept", "X-Requested-With"],
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
};

// Create HTTP server and Socket.IO instance
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: FRONTEND_URLS,
    methods: ["GET", "POST"],
    allowedHeaders: ["Authorization", "Content-Type"],
    credentials: true
  },
  transports: ['websocket', 'polling'],
  pingTimeout: 60000,
  pingInterval: 25000
});

// Make io globally available
global.io = io;

// Trust proxy for rate limiting and real IP
app.set('trust proxy', 1);

// Security middleware
app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// CORS configuration
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: process.env.NODE_ENV === 'development' ? 1000 : 100, // Higher limit for development
    message: {
        success: false,
        message: 'Too many requests from this IP, please try again later.'
    },
    standardHeaders: true,
    legacyHeaders: false,
    // Skip rate limiting for development on localhost
    skip: (req) => {
      if (process.env.NODE_ENV === 'development') {
        const ip = req.ip || req.connection.remoteAddress;
        return ip === '::1' || ip === '127.0.0.1' || ip === '::ffff:127.0.0.1';
      }
      return false;
    }
});

// Apply rate limiting to API routes
app.use('/api/', limiter);

// Stricter rate limiting for auth routes
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: process.env.NODE_ENV === 'development' ? 100 : 10, // Higher limit for development
    message: {
        success: false,
        message: 'Too many authentication attempts, please try again later.'
    },
    skip: (req) => {
      if (process.env.NODE_ENV === 'development') {
        const ip = req.ip || req.connection.remoteAddress;
        return ip === '::1' || ip === '127.0.0.1' || ip === '::ffff:127.0.0.1';
      }
      return false;
    }
});

app.use('/api/auth/', authLimiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Database connection
const connectDB = async () => {
    try {
        const conn = await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/enhanced-event-platform', {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });
        console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
    } catch (error) {
        console.error(`❌ MongoDB Connection Error: ${error.message}`);
        process.exit(1);
    }
};

// Connect to database
connectDB();

// ==================== SOCKET.IO CONFIGURATION ====================

// Socket.IO Authentication Middleware
io.use(async (socket, next) => {
  try {
    console.log('🔐 Authenticating socket connection...');
    
    const token = socket.handshake.auth.token;
    const userId = socket.handshake.auth.userId;
    const userRole = socket.handshake.auth.userRole;

    if (!token) {
      console.log('❌ Socket auth failed: No token provided');
      return next(new Error('Authentication error: No token provided'));
    }

    // Clean token (remove Bearer prefix if present)
    const cleanToken = token.replace(/^Bearer\s+/i, '');

    // Verify JWT token
    const decoded = jwt.verify(cleanToken, process.env.JWT_SECRET || 'your-super-secret-key');
    const user = await User.findById(decoded.id).select('-password');
    
    if (!user || !user.isActive) {
      console.log('❌ Socket auth failed: User not found or inactive');
      return next(new Error('Authentication error: User not found or inactive'));
    }

    // Attach user info to socket
    socket.userId = user._id.toString();
    socket.userRole = user.selectedRole;
    socket.userEmail = user.email;
    socket.userName = `${user.firstName} ${user.lastName}`;
    socket.user = user;
    
    console.log(`✅ Socket authenticated: ${socket.userName} (${socket.userRole}) - Socket: ${socket.id}`);
    next();
  } catch (error) {
    console.error('❌ Socket authentication error:', error.message);
    next(new Error(`Authentication error: ${error.message}`));
  }
});

// Socket.IO Connection Handler
io.on('connection', (socket) => {
  console.log(`🔌 User connected: ${socket.userName} (${socket.userRole}) - Socket ID: ${socket.id}`);

  // Join user-specific room
  socket.join(`user:${socket.userId}`);
  console.log(`📱 User ${socket.userName} joined room: user:${socket.userId}`);
  
  // Join role-specific room
  socket.join(`role:${socket.userRole}`);
  console.log(`👥 User ${socket.userName} joined room: role:${socket.userRole}`);

  // Send welcome message
  socket.emit('connected', {
    success: true,
    message: 'Connected to TickMate real-time updates',
    userId: socket.userId,
    role: socket.userRole,
    userName: socket.userName,
    timestamp: new Date().toISOString()
  });

  // ==================== EVENT ROOM MANAGEMENT ====================

  // Join specific event room
  socket.on('join_event', (eventId) => {
    if (eventId) {
      socket.join(`event:${eventId}`);
      console.log(`📅 User ${socket.userName} joined event room: ${eventId}`);
      
      socket.emit('event_joined', {
        success: true,
        eventId,
        message: `Joined event ${eventId} updates`
      });
    }
  });

  // Leave specific event room
  socket.on('leave_event', (eventId) => {
    if (eventId) {
      socket.leave(`event:${eventId}`);
      console.log(`📅 User ${socket.userName} left event room: ${eventId}`);
      
      socket.emit('event_left', {
        success: true,
        eventId,
        message: `Left event ${eventId} updates`
      });
    }
  });

  // Join staff room
  socket.on('join_staff_room', (userId) => {
    if (socket.userRole === 'event_staff' || socket.userRole === 'event_host') {
      socket.join(`staff:${userId}`);
      console.log(`👷 User ${socket.userName} joined staff room: staff:${userId}`);
      
      socket.emit('staff_room_joined', {
        success: true,
        userId,
        message: 'Joined staff room for updates'
      });
    } else {
      socket.emit('error', { message: 'Access denied: Staff role required' });
    }
  });

  // Leave staff room
  socket.on('leave_staff_room', (userId) => {
    socket.leave(`staff:${userId}`);
    console.log(`👷 User ${socket.userName} left staff room: staff:${userId}`);
    
    socket.emit('staff_room_left', {
      success: true,
      userId,
      message: 'Left staff room'
    });
  });

  // ==================== REAL-TIME EVENT HANDLERS ====================

  // Handle typing indicators (for chat features)
  socket.on('typing', (data) => {
    socket.to(`event:${data.eventId}`).emit('user_typing', {
      userId: socket.userId,
      userName: socket.userName,
      eventId: data.eventId
    });
  });

  socket.on('stop_typing', (data) => {
    socket.to(`event:${data.eventId}`).emit('user_stop_typing', {
      userId: socket.userId,
      eventId: data.eventId
    });
  });

  // Handle connection health check
  socket.on('ping', () => {
    socket.emit('pong', {
      timestamp: new Date().toISOString(),
      userId: socket.userId
    });
  });

  // Handle user status updates
  socket.on('update_status', (status) => {
    socket.broadcast.emit('user_status_changed', {
      userId: socket.userId,
      userName: socket.userName,
      status,
      timestamp: new Date().toISOString()
    });
  });

  // ==================== DISCONNECTION HANDLER ====================

  socket.on('disconnect', (reason) => {
    console.log(`❌ User disconnected: ${socket.userName} (${socket.userRole}) - Reason: ${reason}`);
    
    // Notify others that user went offline
    socket.broadcast.emit('user_offline', {
      userId: socket.userId,
      userName: socket.userName,
      reason,
      timestamp: new Date().toISOString()
    });
  });

  // Handle connection errors
  socket.on('error', (error) => {
    console.error(`⚠️ Socket error for user ${socket.userName}:`, error);
  });
});

// ==================== SOCKET.IO HELPER FUNCTIONS ====================

// Helper function to emit to specific user
global.emitToUser = (userId, event, data) => {
  try {
    io.to(`user:${userId}`).emit(event, {
      ...data,
      timestamp: new Date().toISOString()
    });
    console.log(`📤 Emitted '${event}' to user: ${userId}`);
  } catch (error) {
    console.error('❌ Error emitting to user:', error);
  }
};

// Helper function to emit to all users with specific role
global.emitToRole = (role, event, data) => {
  try {
    io.to(`role:${role}`).emit(event, {
      ...data,
      timestamp: new Date().toISOString()
    });
    console.log(`📤 Emitted '${event}' to role: ${role}`);
  } catch (error) {
    console.error('❌ Error emitting to role:', error);
  }
};

// Helper function to emit to specific event participants
global.emitToEvent = (eventId, event, data) => {
  try {
    io.to(`event:${eventId}`).emit(event, {
      ...data,
      timestamp: new Date().toISOString()
    });
    console.log(`📤 Emitted '${event}' to event: ${eventId}`);
  } catch (error) {
    console.error('❌ Error emitting to event:', error);
  }
};

// Helper function to emit to staff room
global.emitToStaff = (staffId, event, data) => {
  try {
    io.to(`staff:${staffId}`).emit(event, {
      ...data,
      timestamp: new Date().toISOString()
    });
    console.log(`📤 Emitted '${event}' to staff: ${staffId}`);
  } catch (error) {
    console.error('❌ Error emitting to staff:', error);
  }
};

// Helper function to broadcast to all connected users
global.broadcastToAll = (event, data) => {
  try {
    io.emit(event, {
      ...data,
      timestamp: new Date().toISOString()
    });
    console.log(`📢 Broadcasted '${event}' to all users`);
  } catch (error) {
    console.error('❌ Error broadcasting to all:', error);
  }
};

// Get connected users count
global.getConnectedUsersCount = () => {
  return io.engine.clientsCount;
};

// Get users in specific room
global.getUsersInRoom = (room) => {
  const clients = io.sockets.adapter.rooms.get(room);
  return clients ? clients.size : 0;
};

// ==================== API ROUTES ====================

app.use('/api/auth', authRoutes);
app.use('/api/host', eventHostRoutes);
app.use('/api/attendee', eventAttendeeRoutes);
app.use('/api/staff', eventStaffRoutes);
app.use('/api/payments', demoPaymentRoutes);
app.use('/api/onboarding', onboardingRoutes);
app.use('/api/events', eventsRoutes);

// ==================== HEALTH CHECK & INFO ENDPOINTS ====================

// Health check endpoint with Socket.IO info
app.get('/api/health', (req, res) => {
    res.status(200).json({
        success: true,
        message: 'Enhanced Event Platform API is running!',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development',
        socketIO: {
            connected: io.engine.clientsCount,
            enabled: true,
            transports: ['websocket', 'polling']
        },
        database: {
            status: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
            host: mongoose.connection.host,
            name: mongoose.connection.name
        }
    });
});

// Socket.IO status endpoint
app.get('/api/socket/status', (req, res) => {
    const rooms = {};
    io.sockets.adapter.rooms.forEach((value, key) => {
        if (!key.startsWith('/')) { // Skip default rooms
            rooms[key] = value.size;
        }
    });

    res.status(200).json({
        success: true,
        message: 'Socket.IO Status',
        connectedUsers: io.engine.clientsCount,
        rooms: rooms,
        timestamp: new Date().toISOString()
    });
});

// Root endpoint
app.get('/', (req, res) => {
    res.status(200).json({
        success: true,
        message: 'Welcome to Enhanced Event Platform API',
        version: '2.0.0',
        documentation: '/api/docs',
        socketIO: {
            enabled: true,
            connected: io.engine.clientsCount
        },
        endpoints: {
            auth: '/api/auth',
            host: '/api/host',
            attendee: '/api/attendee',
            staff: '/api/staff',
            payments: '/api/payments',
            onboarding: '/api/onboarding',
            events: '/api/events',
            health: '/api/health',
            socketStatus: '/api/socket/status'
        }
    });
});

// ==================== ERROR HANDLING ====================

// Global error handling middleware
app.use((err, req, res, next) => {
    console.error('Global Error Handler:', {
        message: err.message,
        stack: err.stack,
        url: req.url,
        method: req.method,
        ip: req.ip,
        userAgent: req.get('User-Agent')
    });

    // Mongoose validation error
    if (err.name === 'ValidationError') {
        const errors = Object.values(err.errors).map(e => e.message);
        return res.status(400).json({
            success: false,
            message: 'Validation Error',
            errors
        });
    }

    // Mongoose duplicate key error
    if (err.code === 11000) {
        const field = Object.keys(err.keyValue)[0];
        return res.status(400).json({
            success: false,
            message: `${field} already exists`
        });
    }

    // JWT errors
    if (err.name === 'JsonWebTokenError') {
        return res.status(401).json({
            success: false,
            message: 'Invalid token'
        });
    }

    if (err.name === 'TokenExpiredError') {
        return res.status(401).json({
            success: false,
            message: 'Token expired'
        });
    }

    // Default error response
    res.status(err.statusCode || 500).json({
        success: false,
        message: err.message || 'Internal Server Error',
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
});

// Handle 404 routes
app.use('*', (req, res) => {
    res.status(404).json({
        success: false,
        message: `Route ${req.originalUrl} not found`
    });
});

// ==================== GRACEFUL SHUTDOWN ====================

// Graceful shutdown
const gracefulShutdown = (signal) => {
    console.log(`${signal} received, shutting down gracefully...`);
    
    server.close(() => {
        console.log('HTTP server closed');
        
        // Close all socket connections
        io.close(() => {
            console.log('Socket.IO server closed');
            
            // Close database connection
            mongoose.connection.close(() => {
                console.log('MongoDB connection closed');
                process.exit(0);
            });
        });
    });
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
    gracefulShutdown('UNCAUGHT_EXCEPTION');
});

process.on('unhandledRejection', (err, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', err);
    gracefulShutdown('UNHANDLED_REJECTION');
});

// ==================== START SERVER ====================

// Start server with Socket.IO
server.listen(PORT, () => {
    console.log('');
    console.log('🚀 ===============================================');
    console.log(`🌟 Enhanced Event Platform Server with Socket.IO`);
    console.log('🚀 ===============================================');
    console.log(`📍 Server: http://localhost:${PORT}`);
    console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🔌 Socket.IO: Enabled & Ready`);
    console.log(`🔗 API Documentation: http://localhost:${PORT}/api/docs`);
    console.log(`💚 Health Check: http://localhost:${PORT}/api/health`);
    console.log(`🔌 Socket Status: http://localhost:${PORT}/api/socket/status`);
    console.log('🚀 ===============================================');
    console.log('');
});

module.exports = { app, server, io };
