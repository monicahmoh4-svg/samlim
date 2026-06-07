const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const farmerSchema = new mongoose.Schema({
  // Identity
  fullName:    { type: String, required: true, trim: true },
  phone:       { type: String, required: true, unique: true, trim: true }, // M-Pesa number
  nationalId:  { type: String, trim: true },
  dateOfBirth: { type: Date },
  pin:         { type: String, select: false }, // hashed 4-digit PIN for login

  // Location
  county:      { type: String, required: true },
  subCounty:   { type: String },
  village:     { type: String },
  nearestHub:  { type: mongoose.Schema.Types.ObjectId, ref: 'Hub' },

  // Farm
  primaryCrop: { type: String },
  otherCrops:  [String],
  landSize:    { type: Number }, // acres

  // Platform
  role:        { type: String, enum: ['farmer', 'buyer', 'hub_operator', 'admin'], default: 'farmer' },
  isVerified:  { type: Boolean, default: false },
  isActive:    { type: Boolean, default: true },

  // Financials
  totalEarned:     { type: Number, default: 0 },
  totalSales:      { type: Number, default: 0 },
  lastPaymentDate: { type: Date },
  lastPaymentAmt:  { type: Number },

  // Profile
  profilePhoto: { type: String },
  notes:        { type: String },

}, { timestamps: true });

// Hash PIN before save
farmerSchema.pre('save', async function(next) {
  if (!this.isModified('pin') || !this.pin) return next();
  this.pin = await bcrypt.hash(this.pin, 12);
  next();
});

// Compare PIN
farmerSchema.methods.comparePin = async function(candidatePin) {
  return bcrypt.compare(candidatePin, this.pin);
};

// Virtual: initials for avatar
farmerSchema.virtual('initials').get(function() {
  return this.fullName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
});

farmerSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('Farmer', farmerSchema);
