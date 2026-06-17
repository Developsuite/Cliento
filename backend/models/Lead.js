const mongoose = require('mongoose');

const LeadSchema = new mongoose.Schema(
  {
    fullName: { type: String, trim: true, required: true },
    email: { type: String, trim: true, lowercase: true, sparse: true },
    phone: { type: String, trim: true, sparse: true },
    company: { type: String, trim: true, maxlength: 200 },
    source: { 
      type: String, 
      default: 'website', 
      index: true,
      enum: ['website', 'referral', 'facebook', 'linkedin', 'whatsapp', 'marketing', 'cold_call', 'trade_show', 'other']
    },
    status: { 
      type: String, 
      enum: ['new', 'contacted', 'in_progress', 'qualified', 'proposal', 'converted', 'dropped'], 
      default: 'new', 
      index: true 
    },
    priority: { 
      type: String, 
      enum: ['low', 'medium', 'high'], 
      default: 'medium', 
      index: true 
    },
    notes: { type: String, trim: true, maxlength: 2000 },
    estimated_value: { type: Number, min: 0 },
    currency: { type: String, maxlength: 3, uppercase: true },
    order: { type: Number, default: 0, index: true },
    clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', sparse: true },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  },
  { timestamps: true }
);

// Indexes
LeadSchema.index({ email: 1, ownerId: 1 });
LeadSchema.index({ phone: 1, ownerId: 1 });
LeadSchema.index({ createdAt: -1 });
LeadSchema.index({ status: 1, ownerId: 1 });
LeadSchema.index({ source: 1, ownerId: 1 });
LeadSchema.index({ priority: 1, ownerId: 1 });

module.exports = mongoose.models.Lead || mongoose.model('Lead', LeadSchema);
