// backend/models/Event.js - COMPLETE FILE WITH SUPABASE SUPPORT

const mongoose = require('mongoose');

// Check if model already exists
if (mongoose.models.Event) {
  module.exports = mongoose.models.Event;
} else {
  const eventSchema = new mongoose.Schema({
    title: {
      type: String,
      required: true,
      trim: true
    },
    description: {
      type: String,
      required: true
    },
    bannerImageUrl: {
      type: String,
      default: 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=1200&h=600&fit=crop'
    },
    bannerImagePath: {  // NEW FIELD FOR SUPABASE
      type: String,
      default: null
    },
    category: {
      type: String,
      required: true,
      enum: [
        'tech-meetups',
        'workshops-training',
        'open-mic-comedy',
        'fitness-bootcamp',
        'conferences',
        'networking',
        'music-concerts',
        'sports',
        'art-exhibitions',
        'business',
        'other'
      ]
    },
    location: {
      venue: {
        type: String,
        required: true
      },
      address: {
        type: String,
        required: true
      },
      city: {
        type: String,
        required: true
      },
      state: String,
      zipCode: String,
      coordinates: {
        latitude: Number,
        longitude: Number
      }
    },
    startDateTime: {
      type: Date,
      required: true
    },
    endDateTime: {
      type: Date,
      required: true
    },
    pricing: {
      isFree: {
        type: Boolean,
        default: false
      },
      price: {
        type: Number,
        required: function() { return !this.pricing?.isFree; },
        min: 0
      },
      currency: {
        type: String,
        default: 'INR'  // Changed to INR for India
      }
    },
    host: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    assignedStaff: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }
    ],
    capacity: {
      type: Number,
      required: true,
      min: 1
    },
    ticketsSold: {
      type: Number,
      default: 0
    },
    status: {
      type: String,
      enum: ['draft', 'published', 'cancelled', 'completed'],
      default: 'published'
    },
    features: {
      liveStreaming: {
        type: Boolean,
        default: false
      },
      recordingAvailable: {
        type: Boolean,
        default: false
      },
      foodProvided: {
        type: Boolean,
        default: false
      },
      parkingAvailable: {
        type: Boolean,
        default: false
      },
      wheelchairAccessible: {
        type: Boolean,
        default: false
      }
    },
    tags: [String],
    ageRestriction: {
      type: String,
      enum: ['all-ages', '18+', '21+'],
      default: 'all-ages'
    },
    refundPolicy: {
      type: String,
      enum: ['refundable', 'non-refundable', 'partial-refund'],
      default: 'refundable'
    }
  }, { 
    timestamps: true 
  });

  // Indexes for better query performance
  eventSchema.index({ startDateTime: 1 });
  eventSchema.index({ category: 1 });
  eventSchema.index({ 'location.city': 1 });
  eventSchema.index({ host: 1 });
  eventSchema.index({ status: 1 });
  eventSchema.index({ createdAt: -1 });
  
  // Compound indexes
  eventSchema.index({ status: 1, startDateTime: 1 });
  eventSchema.index({ category: 1, startDateTime: 1 });

  // Virtual for checking if event is past
  eventSchema.virtual('isPast').get(function() {
    return this.endDateTime < new Date();
  });

  // Virtual for checking if event is live
  eventSchema.virtual('isLive').get(function() {
    const now = new Date();
    return this.startDateTime <= now && this.endDateTime >= now;
  });

  // Virtual for checking if event is upcoming
  eventSchema.virtual('isUpcoming').get(function() {
    return this.startDateTime > new Date();
  });

  // Virtual for available tickets
  eventSchema.virtual('availableTickets').get(function() {
    return Math.max(0, this.capacity - this.ticketsSold);
  });

  // Virtual for sold out status
  eventSchema.virtual('isSoldOut').get(function() {
    return this.ticketsSold >= this.capacity;
  });

  // Pre-save middleware to validate dates
  eventSchema.pre('save', function(next) {
    if (this.endDateTime <= this.startDateTime) {
      next(new Error('End date must be after start date'));
    }
    next();
  });

  // Pre-save middleware to update status based on dates
  eventSchema.pre('save', function(next) {
    const now = new Date();
    
    if (this.status === 'published') {
      if (this.endDateTime < now) {
        this.status = 'completed';
      }
    }
    
    next();
  });

  // Method to check if user is host
  eventSchema.methods.isHost = function(userId) {
    return this.host.toString() === userId.toString();
  };

  // Method to check if user is assigned staff
  eventSchema.methods.isStaff = function(userId) {
    return this.assignedStaff.some(staffId => staffId.toString() === userId.toString());
  };

  // Static method to find upcoming events
  eventSchema.statics.findUpcoming = function(limit = 10) {
    return this.find({
      status: 'published',
      startDateTime: { $gt: new Date() }
    })
    .sort({ startDateTime: 1 })
    .limit(limit)
    .populate('host', 'firstName lastName');
  };

  // Static method to find events by category
  eventSchema.statics.findByCategory = function(category, limit = 10) {
    return this.find({
      category,
      status: 'published',
      startDateTime: { $gt: new Date() }
    })
    .sort({ startDateTime: 1 })
    .limit(limit)
    .populate('host', 'firstName lastName');
  };

  // Static method to find events by city
  eventSchema.statics.findByCity = function(city, limit = 10) {
    return this.find({
      'location.city': new RegExp(city, 'i'),
      status: 'published',
      startDateTime: { $gt: new Date() }
    })
    .sort({ startDateTime: 1 })
    .limit(limit)
    .populate('host', 'firstName lastName');
  };

  const Event = mongoose.model('Event', eventSchema);
  module.exports = Event;
}

console.log('🎉 Event model loaded successfully with Supabase support');
