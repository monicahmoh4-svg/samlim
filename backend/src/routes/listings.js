const express = require('express');
const router = express.Router();
const Listing = require('../models/Listing');
const Farmer = require('../models/Farmer');
const { protect } = require('../middleware/auth');
const smsService = require('../services/sms');

// ─── GET /api/listings ─── Public: browse all open listings
router.get('/', async (req, res) => {
  try {
    const { category, status = 'open', county, hub, urgent, page = 1, limit = 20 } = req.query;
    const filter = { status };
    if (category) filter.category = category;
    if (urgent === 'true') filter.isUrgent = true;
    if (hub) filter.hubName = new RegExp(hub, 'i');

    const listings = await Listing.find(filter)
      .populate('farmer', 'fullName county phone initials')
      .populate('hub', 'name county')
      .sort({ isUrgent: -1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    const total = await Listing.countDocuments(filter);

    res.json({ success: true, total, page: Number(page), data: listings });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── POST /api/listings ─── Create new listing
router.post('/', protect, async (req, res) => {
  try {
    const {
      productName, category, processingType, description,
      quantityKg, askingPriceKg, minPriceKg, hub, hubName,
      isUrgent, expiresAt, photos,
    } = req.body;

    if (!productName || !quantityKg) {
      return res.status(400).json({ success: false, message: 'Product name and quantity are required.' });
    }

    const listing = await Listing.create({
      productName, category, processingType, description,
      quantityKg: Number(quantityKg),
      askingPriceKg: askingPriceKg ? Number(askingPriceKg) : undefined,
      minPriceKg: minPriceKg ? Number(minPriceKg) : undefined,
      farmer: req.user._id,
      hub, hubName,
      isUrgent: isUrgent || false,
      expiresAt: expiresAt || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days default
      photos,
    });

    await listing.populate('farmer', 'fullName county phone initials');

    // Notify relevant buyers by SMS (in production, query subscribed buyers in county)
    // smsService.broadcastToBuyers(...)

    res.status(201).json({ success: true, data: listing });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// ─── GET /api/listings/:id ─── Get single listing + bids
router.get('/:id', async (req, res) => {
  try {
    const listing = await Listing.findByIdAndUpdate(
      req.params.id,
      { $inc: { views: 1 } },
      { new: true }
    )
      .populate('farmer', 'fullName county phone initials')
      .populate('hub', 'name county operatorName');

    if (!listing) return res.status(404).json({ success: false, message: 'Listing not found.' });
    res.json({ success: true, data: listing });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── POST /api/listings/:id/bid ─── Place a bid
router.post('/:id/bid', protect, async (req, res) => {
  try {
    const { quantity, pricePerKg, message, buyerCompany } = req.body;

    if (!quantity || !pricePerKg) {
      return res.status(400).json({ success: false, message: 'Quantity and price are required.' });
    }

    const listing = await Listing.findById(req.params.id).populate('farmer', 'fullName phone');
    if (!listing) return res.status(404).json({ success: false, message: 'Listing not found.' });
    if (listing.status !== 'open') {
      return res.status(400).json({ success: false, message: 'This listing is not open for bids.' });
    }

    const totalValue = Number(quantity) * Number(pricePerKg);

    listing.bids.push({
      buyer: req.user._id,
      buyerName: req.user.fullName,
      buyerPhone: req.user.phone,
      buyerCompany,
      quantity: Number(quantity),
      pricePerKg: Number(pricePerKg),
      totalValue,
      message,
    });

    listing.bidCount = listing.bids.length;
    if (listing.bids.length >= 2) listing.status = 'negotiating';

    await listing.save();

    // Notify farmer of bid
    await smsService.send(
      listing.farmer.phone,
      `SAM-LiMP: New bid on your ${listing.productName}! ${req.user.fullName} offers KES ${pricePerKg}/kg for ${quantity}kg. Log in to accept.`
    );

    res.status(201).json({ success: true, message: 'Bid placed. Farmer notified via SMS.', data: listing });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// ─── POST /api/listings/:id/accept-bid/:bidId ─── Accept a bid
router.post('/:id/accept-bid/:bidId', protect, async (req, res) => {
  try {
    const listing = await Listing.findById(req.params.id);
    if (!listing) return res.status(404).json({ success: false, message: 'Listing not found.' });

    if (listing.farmer.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Only the listing farmer can accept bids.' });
    }

    const bid = listing.bids.id(req.params.bidId);
    if (!bid) return res.status(404).json({ success: false, message: 'Bid not found.' });

    bid.status = 'accepted';
    listing.acceptedBid = bid._id;
    listing.buyerName = bid.buyerName;
    listing.salePriceKg = bid.pricePerKg;
    listing.saleDate = new Date();
    listing.saleTotal = bid.totalValue;
    listing.status = 'sold';

    // Reject all other bids
    listing.bids.forEach(b => {
      if (b._id.toString() !== req.params.bidId) b.status = 'rejected';
    });

    await listing.save();

    // Notify buyer
    await smsService.send(
      bid.buyerPhone,
      `SAM-LiMP: Your bid on ${listing.productName} was ACCEPTED! Total: KES ${bid.totalValue.toLocaleString()}. Contact hub to arrange collection.`
    );

    res.json({ success: true, message: 'Bid accepted. Buyer notified.', data: listing });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// ─── GET /api/listings/my/listings ─── Farmer's own listings
router.get('/my/listings', protect, async (req, res) => {
  try {
    const listings = await Listing.find({ farmer: req.user._id })
      .populate('hub', 'name')
      .sort({ createdAt: -1 });
    res.json({ success: true, data: listings });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── PATCH /api/listings/:id ─── Update listing (farmer only)
router.patch('/:id', protect, async (req, res) => {
  try {
    const listing = await Listing.findById(req.params.id);
    if (!listing) return res.status(404).json({ success: false, message: 'Listing not found.' });
    if (listing.farmer.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Not authorized.' });
    }
    const allowed = ['productName', 'quantityKg', 'askingPriceKg', 'description', 'isUrgent', 'expiresAt'];
    allowed.forEach(f => { if (req.body[f] !== undefined) listing[f] = req.body[f]; });
    await listing.save();
    res.json({ success: true, data: listing });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// ─── DELETE /api/listings/:id ─── Cancel listing
router.delete('/:id', protect, async (req, res) => {
  try {
    const listing = await Listing.findById(req.params.id);
    if (!listing) return res.status(404).json({ success: false, message: 'Listing not found.' });
    if (listing.farmer.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Not authorized.' });
    }
    listing.status = 'cancelled';
    await listing.save();
    res.json({ success: true, message: 'Listing cancelled.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
