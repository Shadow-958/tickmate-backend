// backend/migrations/addBannerImagePath.js - CREATE THIS FILE

const mongoose = require('mongoose');
const Event = require('../models/Event');
require('dotenv').config();

const migrateEvents = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB');

    // Add bannerImagePath field to all existing events
    const result = await Event.updateMany(
      { bannerImagePath: { $exists: false } },
      { $set: { bannerImagePath: null } }
    );

    console.log(`✅ Updated ${result.modifiedCount} events with bannerImagePath field`);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
};

migrateEvents();
