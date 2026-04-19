const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  username: { type: String, required: true, unique: true },
  phone: { type: String },

  clerkId: {
    type: String,
    unique: true,
    sparse: true // allows multiple docs with null or undefined clerkId
  },

  selectedRole: { 
    type: String, 
    enum: ['event_host', 'event_attendee', 'event_staff'], 
    default: 'event_attendee' 
  },

  onboardingCompleted: {
    type: Boolean,
    default: false
  },

  hostProfile: {
    organizationName: { type: String, default: '' },
    organizationDescription: { type: String, default: '' },
    website: { type: String, default: '' },
    verified: { type: Boolean, default: false },
    eventsCreated: { type: Number, default: 0 }
  },

  staffProfile: {
    permissions: { 
      type: [String], 
      default: ['scan_ticket', 'check_in_attendee'] 
    },
    assignedEvents: [{ 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'Event' 
    }],
    isActive: { type: Boolean, default: true },
    department: { type: String, default: '' }
  },

  attendeeProfile: {
    preferences: { type: [String], default: [] },
    favoriteCategories: { type: [String], default: [] },
    ticketsPurchased: { type: Number, default: 0 },
    eventsAttended: { type: Number, default: 0 }
  },

  photo: { type: String },
  bio: { type: String, maxlength: 500 },
  location: {
    city: { type: String },
    country: { type: String }
  },

  isActive: { type: Boolean, default: true },
  isEmailVerified: { type: Boolean, default: false },

  notifications: {
    email: { type: Boolean, default: true },
    push: { type: Boolean, default: true },
    sms: { type: Boolean, default: false }
  }

}, { timestamps: true });

// Define indexes for performance and uniqueness
userSchema.index({ email: 1 });
userSchema.index({ username: 1 });
userSchema.index({ selectedRole: 1 });
userSchema.index({ clerkId: 1 }, { unique: true, sparse: true }); 

// Virtual property for full name combining first and last
userSchema.virtual('fullName').get(function() {
  return `${this.firstName} ${this.lastName}`;
});

// Pre-save hook: mark onboardingCompleted true if selectedRole set and onboarding not done
userSchema.pre('save', function(next) {
  if (this.selectedRole && !this.onboardingCompleted) {
    this.onboardingCompleted = true;
  }
  next();
});

module.exports = mongoose.models.User || mongoose.model('User', userSchema);

console.log('Enhanced User model loaded successfully');
