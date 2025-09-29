const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');

// Load environment variables
dotenv.config();

// Import routes
const authRoutes = require('./routes/authRoutes');
const eventHostRoutes = require('./routes/eventHostRoutes');
const eventAttendeeRoutes = require('./routes/eventAttendeeRoutes');
const eventStaffRoutes = require('./routes/eventStaffRoutes');
const demoPaymentRoutes = require('./routes/paymentRoutes');
const onboardingRoutes = require('./routes/onBoardingRoutes');
const eventsRoutes = require('./routes/eventsRoutes'); // Add this line

const app = express();
const PORT = process.env.PORT || 5000;

// Trust proxy for rate limiting and real IP
app.set('trust proxy', 1);

// Security middleware
app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// CORS configuration
app.use(cors({
  origin: "http://localhost:5173", // your React app URL
  credentials: true,
  allowedHeaders: ["Authorization", "Content-Type"],
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"]
}));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: {
        success: false,
        message: 'Too many requests from this IP, please try again later.'
    },
    standardHeaders: true,
    legacyHeaders: false
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

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/host', eventHostRoutes);
app.use('/api/attendee', eventAttendeeRoutes);
app.use('/api/staff', eventStaffRoutes);
app.use('/api/payments', demoPaymentRoutes);
app.use('/api/onboarding', onboardingRoutes);
app.use('/api/events', eventsRoutes); // Add this line

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.status(200).json({
        success: true,
        message: 'Enhanced Event Platform API is running!',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development'
    });
});

// Root endpoint
app.get('/', (req, res) => {
    res.status(200).json({
        success: true,
        message: 'Welcome to Enhanced Event Platform API',
        version: '2.0.0',
        documentation: '/api/docs',
        endpoints: {
            auth: '/api/auth',
            host: '/api/host',
            attendee: '/api/attendee',
            staff: '/api/staff',
            payments: '/api/payments',
            onboarding: '/api/onboarding',
            events: '/api/events' // Add this line
        }
    });
});

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

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully...');
    mongoose.connection.close(() => {
        console.log('MongoDB connection closed');
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    console.log('SIGINT received, shutting down gracefully...');
    mongoose.connection.close(() => {
        console.log('MongoDB connection closed');
        process.exit(0);
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Enhanced Event Platform Server running on http://localhost:${PORT}`);
    console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🔗 API Documentation: http://localhost:${PORT}/api/docs`);
});
