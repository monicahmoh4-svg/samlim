const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const Farmer = require('../models/Farmer');
const { signToken, protect } = require('../middleware/auth');
const smsService = require('../services/sms');

// ─── POST /api/auth/register ──────────────────────────────
router.post('/register', [
  body('fullName').notEmpty().trim().withMessage('Full name is required'),
  body('phone').notEmpty().trim().withMessage('Phone number is required'),
  body('county').notEmpty().withMessage('County is required'),
  body('pin').isLength({ min: 4, max: 6 }).withMessage('PIN must be 4–6 digits'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { fullName, phone, pin, county, subCounty, village, nationalId,
            primaryCrop, landSize, role, nearestHub } = req.body;

    // Normalize phone
    const normalizedPhone = phone.replace(/\s+/g, '').replace(/^0/, '254').replace(/^\+/, '');

    const existing = await Farmer.findOne({ phone: normalizedPhone });
    if (existing) {
      return res.status(400).json({ success: false, message: 'A farmer with this phone number already exists.' });
    }

    const farmer = await Farmer.create({
      fullName, phone: normalizedPhone, pin,
      county, subCounty, village, nationalId,
      primaryCrop, landSize, nearestHub,
      role: role || 'farmer',
    });

    // Send welcome SMS
    await smsService.send(
      normalizedPhone,
      `Welcome to SAM-LiMP, ${fullName}! 🌿 You can now sell your produce directly to buyers and get paid via M-Pesa. Sell more, earn more!`
    );

    const token = signToken(farmer._id);

    res.status(201).json({
      success: true,
      message: 'Registration successful',
      token,
      data: {
        id: farmer._id,
        fullName: farmer.fullName,
        phone: farmer.phone,
        county: farmer.county,
        role: farmer.role,
        initials: farmer.initials,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── POST /api/auth/login ─────────────────────────────────
router.post('/login', [
  body('phone').notEmpty().withMessage('Phone required'),
  body('pin').notEmpty().withMessage('PIN required'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { phone, pin } = req.body;
    const normalizedPhone = phone.replace(/\s+/g, '').replace(/^0/, '254').replace(/^\+/, '');

    const farmer = await Farmer.findOne({ phone: normalizedPhone }).select('+pin');
    if (!farmer || !(await farmer.comparePin(pin))) {
      return res.status(401).json({ success: false, message: 'Incorrect phone number or PIN.' });
    }

    if (!farmer.isActive) {
      return res.status(403).json({ success: false, message: 'Account deactivated. Contact support.' });
    }

    const token = signToken(farmer._id);

    res.json({
      success: true,
      token,
      data: {
        id: farmer._id,
        fullName: farmer.fullName,
        phone: farmer.phone,
        county: farmer.county,
        role: farmer.role,
        initials: farmer.initials,
        totalEarned: farmer.totalEarned,
        primaryCrop: farmer.primaryCrop,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── GET /api/auth/me ─────────────────────────────────────
router.get('/me', protect, async (req, res) => {
  res.json({ success: true, data: req.user });
});

// ─── PATCH /api/auth/update-profile ──────────────────────
router.patch('/update-profile', protect, async (req, res) => {
  try {
    const allowed = ['fullName', 'county', 'subCounty', 'village', 'primaryCrop', 'landSize', 'notes'];
    const updates = {};
    allowed.forEach(f => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });

    const farmer = await Farmer.findByIdAndUpdate(req.user._id, updates, { new: true, runValidators: true });
    res.json({ success: true, data: farmer });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

module.exports = router;
