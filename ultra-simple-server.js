const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

console.log('🚀 Starting ultra-simple server...');

// Simple test routes without any models
app.get('/', (req, res) => {
    res.json({
        success: true,
        message: 'Ultra-simple server is running!',
        timestamp: new Date().toISOString()
    });
});

app.post('/test', (req, res) => {
    res.json({
        success: true,
        message: 'POST endpoint working!',
        body: req.body,
        timestamp: new Date().toISOString()
    });
});

// Basic auth routes without database
app.post('/api/auth/register', (req, res) => {
    console.log('📝 Register request:', req.body);
    res.json({
        success: true,
        message: 'Registration endpoint working (no database)',
        user: {
            email: req.body.email,
            firstName: req.body.firstName,
            lastName: req.body.lastName
        },
        token: 'test-token-12345'
    });
});

app.post('/api/auth/login', (req, res) => {
    console.log('🔐 Login request:', req.body);
    res.json({
        success: true,
        message: 'Login endpoint working (no database)',
        user: {
            email: req.body.email
        },
        token: 'test-token-12345'
    });
});

app.listen(PORT, () => {
    console.log(`✅ Ultra-simple server running on http://localhost:${PORT}`);
    console.log('🧪 Test endpoints:');
    console.log(`   GET  http://localhost:${PORT}/`);
    console.log(`   POST http://localhost:${PORT}/api/auth/register`);
    console.log(`   POST http://localhost:${PORT}/api/auth/login`);
    console.log('');
    console.log('🎯 This server has NO database, NO models, NO imports');
    console.log('   Use this to test basic Express functionality');
});