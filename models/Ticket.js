const mongoose = require('mongoose');

// Check if model already exists, if so return it
if (mongoose.models.Ticket) {
  module.exports = mongoose.models.Ticket;
} else {
  const ticketSchema = new mongoose.Schema({
    // Event reference
    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Event',
      required: true
    },

    // Attendee reference
    attendeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },

    // Unique ticket identifier
    ticketNumber: {
      type: String,
      unique: true,
      required: true
    },

    // QR Code for verification
    qrCodeUrl: {
      type: String,
      required: true,
      unique: true
    },

    // QR code data for scanning
    qrCodeData: {
      type: String,
      required: true,
      unique: true
    },

    // Payment information
    paymentId: {
      type: String,
      required: true
    },

    pricePaid: {
      type: Number,
      required: true,
      min: 0
    },

    paymentStatus: {
      type: String,
      enum: ['pending', 'completed', 'failed', 'refunded'],
      default: 'pending'
    },

    // Ticket status
    status: {
      type: String,
      enum: ['active', 'cancelled', 'used', 'expired'],
      default: 'active'
    },

    // Check-in information
    checkInStatus: {
      isCheckedIn: {
        type: Boolean,
        default: false
      },
      checkInTime: {
        type: Date
      },
      checkedInBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      checkInLocation: {
        type: String
      }
    },

    // Booking information
    bookingDate: {
      type: Date,
      default: Date.now
    },

    // Additional attendee information
    attendeeInfo: {
      specialRequirements: String,
      dietaryRestrictions: String,
      emergencyContact: {
        name: String,
        phone: String
      }
    },

    // Verification tracking for event staff
    verification: {
      isScanned: { type: Boolean, default: false },
      scannedAt: { type: Date },
      scannedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // Staff member
      entryTime: { type: Date },
      exitTime: { type: Date },
      scanCount: { type: Number, default: 0 }
    },

    // Staff notes array
    staffNotes: [{
      staffId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      note: String,
      createdAt: { type: Date, default: Date.now }
    }],

  }, { 
    timestamps: true 
  });

  // Indexes for performance
  ticketSchema.index({ eventId: 1, attendeeId: 1 });
  ticketSchema.index({ ticketNumber: 1 });
  ticketSchema.index({ qrCodeData: 1 });
  ticketSchema.index({ paymentId: 1 });
  ticketSchema.index({ status: 1 });

  // Ensure one ticket per user per event
  ticketSchema.index({ eventId: 1, attendeeId: 1 }, { unique: true });

  const Ticket = mongoose.model('Ticket', ticketSchema);
  module.exports = Ticket;

  console.log('🎫 Ticket model loaded safely');
}
