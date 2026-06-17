const mongoose = require('mongoose');

const meetingSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true,
    required: true
  },
  client_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Client',
    required: false
  },
  title: {
    type: String,
    required: [true, 'Meeting title is required'],
    trim: true,
    maxlength: [200, 'Title cannot exceed 200 characters']
  },
  date: {
    type: Date,
    required: [true, 'Meeting date is required']
  },
  time: {
    type: String,
    required: [true, 'Meeting time is required'],
    match: [/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Please enter a valid time format (HH:MM)']
  },
  duration: {
    type: Number,
    default: 60,
    min: [15, 'Duration must be at least 15 minutes'],
    max: [480, 'Duration cannot exceed 8 hours']
  },
  type: {
    type: String,
    enum: ['Initial Consultation', 'Follow-up', 'Pitch', 'Demo', 'Negotiation', 'Closing', 'Other'],
    default: 'Initial Consultation'
  },
  status: {
    type: String,
    enum: ['Scheduled', 'Confirmed', 'In Progress', 'Completed', 'Cancelled', 'Rescheduled'],
    default: 'Scheduled'
  },
  location: {
    type: String,
    trim: true,
    maxlength: [500, 'Location cannot exceed 500 characters']
  },
  notes: {
    type: String,
    trim: true,
    maxlength: [2000, 'Notes cannot exceed 2000 characters']
  },
  agenda: [{
    item: {
      type: String,
      trim: true,
      maxlength: [200, 'Agenda item cannot exceed 200 characters']
    },
    duration: {
      type: Number,
      min: [5, 'Agenda item duration must be at least 5 minutes']
    }
  }],
  attendees: [{
    name: {
      type: String,
      trim: true,
      required: true
    },
    email: {
      type: String,
      trim: true,
      lowercase: true
    },
    role: {
      type: String,
      trim: true
    }
  }],
  reminder: {
    enabled: {
      type: Boolean,
      default: true
    },
    minutes_before: {
      type: Number,
      default: 15,
      min: [1, 'Reminder must be at least 1 minute before'],
      max: [1440, 'Reminder cannot be more than 24 hours before']
    }
  },
  outcome: {
    type: String,
    enum: ['Successful', 'Needs Follow-up', 'Rescheduled', 'Cancelled', 'No Show'],
    default: 'Successful'
  },
  follow_up_required: {
    type: Boolean,
    default: false
  },
  follow_up_date: {
    type: Date
  },
  follow_up_notes: {
    type: String,
    trim: true,
    maxlength: [1000, 'Follow-up notes cannot exceed 1000 characters']
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better query performance
meetingSchema.index({ client_id: 1 });
meetingSchema.index({ date: 1 });
meetingSchema.index({ status: 1 });
meetingSchema.index({ date: 1, time: 1 });

// Virtual for meeting datetime
meetingSchema.virtual('datetime').get(function() {
  if (this.date && this.time) {
    const [hours, minutes] = this.time.split(':');
    const meetingDate = new Date(this.date);
    meetingDate.setHours(parseInt(hours), parseInt(minutes), 0, 0);
    return meetingDate;
  }
  return null;
});

// Virtual for is upcoming
meetingSchema.virtual('isUpcoming').get(function() {
  if (!this.datetime) return false;
  return this.datetime > new Date() && this.status === 'Scheduled';
});

// Pre-save middleware to validate combined datetime
meetingSchema.pre('save', function(next) {
  if (this.date && this.time) {
    const [hours, minutes] = String(this.time).split(':');
    const dt = new Date(this.date);
    if (!isNaN(parseInt(hours)) && !isNaN(parseInt(minutes))) {
      dt.setHours(parseInt(hours), parseInt(minutes), 0, 0);
      if (dt < new Date()) {
        const error = new Error('Meeting datetime cannot be in the past');
        return next(error);
      }
    }
  }
  next();
});

// Static method to get upcoming meetings
meetingSchema.statics.getUpcoming = function() {
  return this.find({
    date: { $gte: new Date() },
    status: { $in: ['Scheduled', 'Confirmed'] }
  }).sort({ date: 1, time: 1 });
};

// Static method to get meetings by client
meetingSchema.statics.getByClient = function(clientId) {
  return this.find({ client_id: clientId }).sort({ date: -1 });
};

// Instance method to reschedule
meetingSchema.methods.reschedule = function(newDate, newTime) {
  this.date = newDate;
  this.time = newTime;
  this.status = 'Rescheduled';
  return this.save();
};

module.exports = mongoose.model('Meeting', meetingSchema);
