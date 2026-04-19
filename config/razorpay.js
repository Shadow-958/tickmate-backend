// Razorpay Configuration
const Razorpay = require('razorpay');

// Get Razorpay credentials from environment variables
const keyId = process.env.RAZORPAY_KEY_ID;
const keySecret = process.env.RAZORPAY_KEY_SECRET;

// Validate configuration
if (!keyId || !keySecret) {
  console.error('❌ Razorpay credentials not found in environment variables');
  console.error('Please add the following to your .env file:');
  console.error('RAZORPAY_KEY_ID=rzp_test_your_key_id_here');
  console.error('RAZORPAY_KEY_SECRET=your_secret_key_here');
  console.error('');
  console.error('To get test keys:');
  console.error('1. Go to https://dashboard.razorpay.com/');
  console.error('2. Sign up or login');
  console.error('3. Go to Settings > API Keys');
  console.error('4. Generate Test API Keys');
  console.error('5. Copy the Key ID and Key Secret');
  
  // Export a mock razorpay instance for development
  module.exports = {
    orders: {
      create: async (orderOptions) => {
        throw new Error('Razorpay not configured. Please add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to your .env file');
      }
    }
  };
  return;
}

// Initialize Razorpay instance with proper credentials
let razorpay;
try {
  razorpay = new Razorpay({
    key_id: keyId,
    key_secret: keySecret,
  });
  
  console.log('✅ Razorpay initialized successfully');
  console.log('🔑 Key ID:', keyId.substring(0, 8) + '...');
} catch (error) {
  console.error('❌ Failed to initialize Razorpay:', error.message);
  throw error;
}

module.exports = razorpay;
