const express = require('express');
const router  = express.Router();
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const { pool } = require('../config/db');
const { protect } = require('../middleware/auth');

const signToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '30d',
  });

const normalize = (phone) =>
  phone.replace(/\s+/g, '').replace(/^\+/, '').replace(/^0/, '254');

// POST /api/auth/register
router.post('/register', [
  body('fullName').notEmpty().trim(),
  body('phone').notEmpty().trim(),
  body('county').notEmpty(),
  body('pin').isLength({ min: 4, max: 6 }),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ success: false, errors: errors.array() });

    const { fullName, phone, pin, county, primaryCrop, landSize, role } = req.body;
    const normalizedPhone = normalize(phone);

    const existing = await pool.query('SELECT id FROM farmers WHERE phone = $1', [normalizedPhone]);
    if (existing.rows.length)
      return res.status(400).json({ success: false, message: 'Phone number already registered.' });

    const hashedPin = await bcrypt.hash(pin, 12);

    const { rows } = await pool.query(
      `INSERT INTO farmers (full_name, phone, pin, county, primary_crop, land_size, role)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, full_name, phone, county, primary_crop, role`,
      [fullName, normalizedPhone, hashedPin, county, primaryCrop || null, landSize || null, role || 'farmer']
    );

    const farmer = rows[0];
    const token = signToken(farmer.id);

    res.status(201).json({
      success: true,
      message: 'Registration successful',
      token,
      data: {
        id: farmer.id,
        fullName: farmer.full_name,
        phone: farmer.phone,
        county: farmer.county,
        role: farmer.role,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/auth/login
router.post('/login', [
  body('phone').notEmpty(),
  body('pin').notEmpty(),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ success: false, errors: errors.array() });

    const { phone, pin } = req.body;
    const normalizedPhone = normalize(phone);

    const { rows } = await pool.query(
      'SELECT * FROM farmers WHERE phone = $1 AND is_active = true',
      [normalizedPhone]
    );
    if (!rows.length)
      return res.status(401).json({ success: false, message: 'Incorrect phone or PIN.' });

    const farmer = rows[0];
    const valid = await bcrypt.compare(pin, farmer.pin);
    if (!valid)
      return res.status(401).json({ success: false, message: 'Incorrect phone or PIN.' });

    const token = signToken(farmer.id);

    res.json({
      success: true,
      token,
      data: {
        id: farmer.id,
        fullName: farmer.full_name,
        phone: farmer.phone,
        county: farmer.county,
        role: farmer.role,
        totalEarned: farmer.total_earned,
        primaryCrop: farmer.primary_crop,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/auth/me
router.get('/me', protect, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, full_name, phone, county, primary_crop, role, total_earned, is_verified FROM farmers WHERE id = $1',
      [req.user.id]
    );
    if (!rows.length)
      return res.status(404).json({ success: false, message: 'User not found.' });
    const f = rows[0];
    res.json({
      success: true,
      data: {
        id: f.id, fullName: f.full_name, phone: f.phone,
        county: f.county, primaryCrop: f.primary_crop,
        role: f.role, totalEarned: f.total_earned, isVerified: f.is_verified,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /api/auth/update-profile
router.patch('/update-profile', protect, async (req, res) => {
  try {
    const { fullName, county, primaryCrop, landSize, notes } = req.body;
    const { rows } = await pool.query(
      `UPDATE farmers SET
        full_name    = COALESCE($1, full_name),
        county       = COALESCE($2, county),
        primary_crop = COALESCE($3, primary_crop),
        land_size    = COALESCE($4, land_size),
        notes        = COALESCE($5, notes),
        updated_at   = NOW()
       WHERE id = $6
       RETURNING id, full_name, phone, county, primary_crop, role, total_earned`,
      [fullName, county, primaryCrop, landSize, notes, req.user.id]
    );
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

module.exports = router;
