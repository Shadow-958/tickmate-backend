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
      default: 'https://via.placeholder.com/1200x400/4A90E2/FFFFFF?text=Event+Banner'
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
      zipCode: String
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
        default: 'USD'
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
    }
  }, { 
    timestamps: true 
  });

  eventSchema.index({ startDateTime: 1 });
  eventSchema.index({ category: 1 });
  eventSchema.index({ 'location.city': 1 });
  eventSchema.index({ host: 1 });

  const Event = mongoose.model('Event', eventSchema);
  module.exports = Event;
}

console.log('🎉 Event model loaded safely');
