const mongoose = require('mongoose');

const bidSchema = new mongoose.Schema({
  buyer:        { type: mongoose.Schema.Types.ObjectId, ref: 'Farmer' },
  buyerName:    String,
  buyerPhone:   String,
  buyerCompany: String,
  quantity:     Number,
  pricePerKg:   Number,
  totalValue:   Number,
  status:       { type: String, enum: ['pending', 'accepted', 'rejected', 'withdrawn'], default: 'pending' },
  message:      String,
  placedAt:     { type: Date, default: Date.now },
}, { _id: true });

const listingSchema = new mongoose.Schema({
  // Product
  productName:     { type: String, required: true, trim: true },
  category:        { type: String, enum: ['grains', 'vegetables', 'fruits', 'oils', 'processed', 'fresh', 'other'], default: 'other' },
  processingType:  { type: String, enum: ['fresh_raw', 'dried', 'milled', 'paste_sauce', 'chips_sliced', 'roasted', 'cold_pressed', 'packaged', 'other'], default: 'fresh_raw' },
  description:     String,

  // Quantity & Pricing
  quantityKg:      { type: Number, required: true, min: 0.1 },
  quantityLeft:    { type: Number },
  askingPriceKg:   { type: Number }, // null = open to best bid
  minPriceKg:      { type: Number },

  // Parties
  farmer:          { type: mongoose.Schema.Types.ObjectId, ref: 'Farmer', required: true },
  hub:             { type: mongoose.Schema.Types.ObjectId, ref: 'Hub' },
  hubName:         String, // denormalized for speed

  // Status
  status:          { type: String, enum: ['open', 'negotiating', 'sold', 'expired', 'cancelled'], default: 'open' },
  isUrgent:        { type: Boolean, default: false },
  expiresAt:       { type: Date },

  // Bids
  bids:            [bidSchema],
  acceptedBid:     { type: mongoose.Schema.Types.ObjectId },
  buyerName:       String, // after sale
  salePriceKg:     Number,
  saleDate:        Date,
  saleTotal:       Number,

  // Media
  photos:          [String],

  // Analytics
  views:           { type: Number, default: 0 },
  bidCount:        { type: Number, default: 0 },

}, { timestamps: true });

// Auto-set quantityLeft on create
listingSchema.pre('save', function(next) {
  if (this.isNew) this.quantityLeft = this.quantityKg;
  next();
});

// Index for fast queries
listingSchema.index({ status: 1, category: 1 });
listingSchema.index({ farmer: 1 });
listingSchema.index({ hub: 1 });
listingSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Listing', listingSchema);
