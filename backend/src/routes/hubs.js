const express = require('express');
const router  = express.Router();
const { pool } = require('../config/db');
const { protect } = require('../middleware/auth');

// GET /api/listings
router.get('/', async (req, res) => {
  try {
    const { category, status = 'open', urgent, page = 1, limit = 20 } = req.query;
    let q = `SELECT l.*, f.full_name as farmer_name, f.county as farmer_county
             FROM listings l LEFT JOIN farmers f ON l.farmer_id = f.id
             WHERE l.status = $1`;
    const params = [status];
    if (category) { params.push(category); q += ` AND l.category = $${params.length}`; }
    if (urgent === 'true') q += ' AND l.is_urgent = true';
    q += ` ORDER BY l.is_urgent DESC, l.created_at DESC LIMIT $${params.length+1} OFFSET $${params.length+2}`;
    params.push(Number(limit), (page - 1) * Number(limit));
    const { rows } = await pool.query(q, params);
    const total = (await pool.query("SELECT COUNT(*) FROM listings WHERE status = 'open'")).rows[0].count;
    res.json({ success: true, total: Number(total), data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/listings
router.post('/', protect, async (req, res) => {
  try {
    const { productName, category, processingType, description,
            quantityKg, askingPriceKg, hubName, isUrgent, expiresAt } = req.body;
    if (!productName || !quantityKg)
      return res.status(400).json({ success: false, message: 'Product name and quantity are required.' });

    const expires = expiresAt || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const { rows } = await pool.query(
      `INSERT INTO listings (product_name, category, processing_type, description,
        quantity_kg, quantity_left, asking_price_kg, farmer_id, hub_name, is_urgent, expires_at)
       VALUES ($1,$2,$3,$4,$5,$5,$6,$7,$8,$9,$10)
       RETURNING *`,
      [productName, category || 'other', processingType || 'fresh_raw', description,
       Number(quantityKg), askingPriceKg ? Number(askingPriceKg) : null,
       req.user.id, hubName, isUrgent || false, expires]
    );
    res.status(201).json({ success: true, data: rows[0] });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// GET /api/listings/my/listings
router.get('/my/listings', protect, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM listings WHERE farmer_id = $1 ORDER BY created_at DESC',
      [req.user.id]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/listings/:id
router.get('/:id', async (req, res) => {
  try {
    await pool.query('UPDATE listings SET views = views + 1 WHERE id = $1', [req.params.id]);
    const { rows } = await pool.query(
      `SELECT l.*, f.full_name as farmer_name, f.phone as farmer_phone
       FROM listings l LEFT JOIN farmers f ON l.farmer_id = f.id
       WHERE l.id = $1`,
      [req.params.id]
    );
    if (!rows.length)
      return res.status(404).json({ success: false, message: 'Listing not found.' });
    const bids = await pool.query('SELECT * FROM bids WHERE listing_id = $1 ORDER BY placed_at DESC', [req.params.id]);
    res.json({ success: true, data: { ...rows[0], bids: bids.rows } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/listings/:id/bid
router.post('/:id/bid', protect, async (req, res) => {
  try {
    const { quantity, pricePerKg, message, buyerCompany } = req.body;
    if (!quantity || !pricePerKg)
      return res.status(400).json({ success: false, message: 'Quantity and price required.' });

    const listing = await pool.query('SELECT * FROM listings WHERE id = $1', [req.params.id]);
    if (!listing.rows.length)
      return res.status(404).json({ success: false, message: 'Listing not found.' });
    if (listing.rows[0].status !== 'open')
      return res.status(400).json({ success: false, message: 'Listing not open for bids.' });

    const totalValue = Number(quantity) * Number(pricePerKg);
    await pool.query(
      `INSERT INTO bids (listing_id, buyer_name, buyer_phone, buyer_company, quantity, price_per_kg, total_value, message)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [req.params.id, req.user.full_name, req.user.phone, buyerCompany, Number(quantity), Number(pricePerKg), totalValue, message]
    );
    await pool.query(
      'UPDATE listings SET bid_count = bid_count + 1, status = CASE WHEN bid_count >= 1 THEN $1 ELSE status END WHERE id = $2',
      ['negotiating', req.params.id]
    );
    res.status(201).json({ success: true, message: 'Bid placed. Farmer will be notified.' });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// PATCH /api/listings/:id
router.patch('/:id', protect, async (req, res) => {
  try {
    const listing = await pool.query('SELECT * FROM listings WHERE id = $1', [req.params.id]);
    if (!listing.rows.length)
      return res.status(404).json({ success: false, message: 'Listing not found.' });
    if (listing.rows[0].farmer_id !== req.user.id && req.user.role !== 'admin')
      return res.status(403).json({ success: false, message: 'Not authorized.' });

    const { productName, quantityKg, askingPriceKg, description, isUrgent } = req.body;
    const { rows } = await pool.query(
      `UPDATE listings SET
        product_name    = COALESCE($1, product_name),
        quantity_kg     = COALESCE($2, quantity_kg),
        asking_price_kg = COALESCE($3, asking_price_kg),
        description     = COALESCE($4, description),
        is_urgent       = COALESCE($5, is_urgent)
       WHERE id = $6 RETURNING *`,
      [productName, quantityKg, askingPriceKg, description, isUrgent, req.params.id]
    );
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// DELETE /api/listings/:id — cancel
router.delete('/:id', protect, async (req, res) => {
  try {
    const listing = await pool.query('SELECT * FROM listings WHERE id = $1', [req.params.id]);
    if (!listing.rows.length)
      return res.status(404).json({ success: false, message: 'Listing not found.' });
    if (listing.rows[0].farmer_id !== req.user.id && req.user.role !== 'admin')
      return res.status(403).json({ success: false, message: 'Not authorized.' });
    await pool.query("UPDATE listings SET status = 'cancelled' WHERE id = $1", [req.params.id]);
    res.json({ success: true, message: 'Listing cancelled.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
