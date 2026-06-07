const mongoose = require('mongoose');

// ─── HUB ────────────────────────────────────────────────────────────
const hubSchema = new mongoose.Schema({
  name:           { type: String, required: true, trim: true },
  county:         { type: String, required: true },
  subCounty:      String,
  village:        String,
  coordinates:    { lat: Number, lng: Number },

  operator:       { type: mongoose.Schema.Types.ObjectId, ref: 'Farmer' },
  operatorName:   String, // denormalized
  operatorPhone:  String,

  capacityTonsPerWeek: { type: Number, default: 2 },
  currentLoadPct:      { type: Number, default: 0 }, // 0–100

  equipment: [{
    name: String,
    quantity: Number,
    functional: { type: Boolean, default: true },
  }],

  services: [{ type: String }], // e.g. 'milling', 'drying', 'cold_storage', 'packaging'

  isActive:     { type: Boolean, default: true },
  isFull:       { type: Boolean, default: false },
  monthlyRevenue: { type: Number, default: 0 },
  farmerCount:    { type: Number, default: 0 },

  notes: String,
  licenseFeePaid: { type: Boolean, default: false },
  licenseExpiry:  Date,

}, { timestamps: true });

hubSchema.index({ county: 1 });
hubSchema.index({ isActive: 1 });

const Hub = mongoose.model('Hub', hubSchema);

// ─── PAYMENT ─────────────────────────────────────────────────────────
const paymentSchema = new mongoose.Schema({
  farmer:         { type: mongoose.Schema.Types.ObjectId, ref: 'Farmer', required: true },
  farmerName:     String,
  farmerPhone:    String,

  listing:        { type: mongoose.Schema.Types.ObjectId, ref: 'Listing' },
  hub:            { type: mongoose.Schema.Types.ObjectId, ref: 'Hub' },
  hubName:        String,

  amountKES:      { type: Number, required: true },
  commissionKES:  { type: Number, default: 0 }, // platform 2.5%
  netToFarmer:    { type: Number },

  type:           { type: String, enum: ['sale_payment', 'hub_fee', 'subscription', 'refund', 'other'], default: 'sale_payment' },
  description:    String,

  // M-Pesa
  mpesaRef:           String, // MerchantRequestID
  mpesaReceiptNumber: String,
  mpesaStatus:        { type: String, enum: ['pending', 'success', 'failed', 'timeout'], default: 'pending' },
  mpesaResultCode:    Number,
  mpesaResultDesc:    String,
  mpesaCallbackData:  mongoose.Schema.Types.Mixed,
  initiatedAt:        { type: Date, default: Date.now },
  completedAt:        Date,

  // SMS
  smsSent: { type: Boolean, default: false },

}, { timestamps: true });

paymentSchema.pre('save', function(next) {
  if (!this.netToFarmer) {
    this.commissionKES = Math.round(this.amountKES * 0.025);
    this.netToFarmer = this.amountKES - this.commissionKES;
  }
  next();
});

paymentSchema.index({ farmer: 1, mpesaStatus: 1 });
paymentSchema.index({ createdAt: -1 });

const Payment = mongoose.model('Payment', paymentSchema);

module.exports = { Hub, Payment };
