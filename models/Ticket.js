const mongoose = require('mongoose');

// Check if model already exists; if so, export that to avoid recompilation errors
if (mongoose.models.Ticket) {
  module.exports = mongoose.models.Ticket;
} else {
  const ticketSchema = new mongoose.Schema({
    // Event reference
    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Event',
      required: true,
    },

    // Attendee reference
    attendeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    // Unique ticket identifier
    ticketNumber: {
      type: String,
      unique: true,
      required: true,
    },

    // QR Code URL for the ticket
    qrCodeUrl: {
      type: String,
      required: true,
      unique: true,
    },

    // QR Code data string scanned from the ticket
    qrCodeData: {
      type: String,
      required: true,
      unique: true,
    },

    // Payment information
    paymentId: {
      type: String,
      required: true,
    },

    // Price paid in smallest currency unit (e.g., cents)
    pricePaid: {
      type: Number,
      required: true,
      min: 0,
    },

    // Payment status of the ticket
    paymentStatus: {
      type: String,
      enum: ['pending', 'completed', 'failed', 'refunded'],
      default: 'pending',
    },

    // Ticket status
    status: {
      type: String,
      enum: ['active', 'cancelled', 'used', 'expired'],
      default: 'active',
    },

    // Check-in information for this ticket
    checkInStatus: {
      isCheckedIn: {
        type: Boolean,
        default: false,
      },
      checkInTime: {
        type: Date,
      },
      // ✅ FIXED: Changed from checkedInBy to scannedBy to match your backend code
      scannedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
      checkInLocation: {
        type: String,
      },
      // Optional: role of scanner (e.g., 'host', 'staff')
      scannerRole: {
        type: String,
        default: 'host',
      },
      // Optional: human-readable name of the person who scanned
      scannerName: {
        type: String,
      },
    },

    // Verification tracking specifically for staff scanning
    verification: {
      isScanned: { type: Boolean, default: false },
      scannedAt: { type: Date },
      scannedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // Staff user reference
      entryTime: { type: Date },
      exitTime: { type: Date },
      scanCount: { type: Number, default: 0 },
    },

    // Notes added by staff members
    staffNotes: [
      {
        staffId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        note: String,
        createdAt: { type: Date, default: Date.now },
      },
    ],

    // Additional attendee information
    attendeeInfo: {
      specialRequirements: String,
      dietaryRestrictions: String,
      emergencyContact: {
        name: String,
        phone: String,
      },
    },

    // Booking date (when ticket was booked)
    bookingDate: {
      type: Date,
      default: Date.now,
    },
  }, {
    timestamps: true,
  });

  // Indexes for performance and uniqueness constraints
  ticketSchema.index({ eventId: 1, attendeeId: 1 }, { unique: true });
  ticketSchema.index({ ticketNumber: 1 });
  ticketSchema.index({ qrCodeUrl: 1 });
  ticketSchema.index({ qrCodeData: 1 });
  ticketSchema.index({ paymentId: 1 });
  ticketSchema.index({ status: 1 });

  const Ticket = mongoose.model('Ticket', ticketSchema);
  module.exports = Ticket;

  console.log('🎫 Ticket model loaded safely.');
}
