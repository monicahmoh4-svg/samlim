const express = require('express');
const router  = express.Router();
const { pool } = require('../config/db');
const { protect, restrictTo } = require('../middleware/auth');

// GET /api/farmers — admin list
router.get('/', protect, restrictTo('admin', 'hub_operator'), async (req, res) => {
  try {
    const { county, page = 1, limit = 50 } = req.query;
    let q = 'SELECT id, full_name, phone, county, primary_crop, land_size, role, is_active, total_earned, created_at FROM farmers WHERE 1=1';
    const params = [];
    if (county) { params.push(county); q += ` AND county ILIKE $${params.length}`; }
    q += ` ORDER BY created_at DESC LIMIT $${params.length+1} OFFSET $${params.length+2}`;
    params.push(Number(limit), (page - 1) * Number(limit));
    const { rows } = await pool.query(q, params);
    const total = (await pool.query('SELECT COUNT(*) FROM farmers')).rows[0].count;
    res.json({ success: true, total: Number(total), data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/farmers/stats
router.get('/stats', protect, restrictTo('admin'), async (req, res) => {
  try {
    const [total, active, byCounty, totalEarned] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM farmers'),
      pool.query('SELECT COUNT(*) FROM farmers WHERE is_active = true'),
      pool.query('SELECT county, COUNT(*) as count FROM farmers GROUP BY county ORDER BY count DESC'),
      pool.query('SELECT SUM(total_earned) as total FROM farmers'),
    ]);
    res.json({
      success: true,
      data: {
        total: Number(total.rows[0].count),
        active: Number(active.rows[0].count),
        byCounty: byCounty.rows,
        totalEarnedByFarmers: Number(totalEarned.rows[0].total || 0),
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/farmers/:id
router.get('/:id', protect, async (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user.id !== req.params.id)
      return res.status(403).json({ success: false, message: 'Not authorized.' });

    const { rows } = await pool.query(
      'SELECT id, full_name, phone, county, primary_crop, land_size, role, is_active, total_earned, total_sales, created_at FROM farmers WHERE id = $1',
      [req.params.id]
    );
    if (!rows.length)
      return res.status(404).json({ success: false, message: 'Farmer not found.' });

    const payments = await pool.query(
      'SELECT * FROM payments WHERE farmer_id = $1 ORDER BY created_at DESC LIMIT 10',
      [req.params.id]
    );
    res.json({ success: true, data: { ...rows[0], recentPayments: payments.rows } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /api/farmers/:id
router.patch('/:id', protect, async (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user.id !== req.params.id)
      return res.status(403).json({ success: false, message: 'Not authorized.' });

    const { fullName, county, primaryCrop, landSize, notes } = req.body;
    const { rows } = await pool.query(
      `UPDATE farmers SET
        full_name    = COALESCE($1, full_name),
        county       = COALESCE($2, county),
        primary_crop = COALESCE($3, primary_crop),
        land_size    = COALESCE($4, land_size),
        notes        = COALESCE($5, notes),
        updated_at   = NOW()
       WHERE id = $6 RETURNING id, full_name, phone, county, primary_crop, role`,
      [fullName, county, primaryCrop, landSize, notes, req.params.id]
    );
    if (!rows.length)
      return res.status(404).json({ success: false, message: 'Farmer not found.' });
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// DELETE /api/farmers/:id — deactivate
router.delete('/:id', protect, restrictTo('admin'), async (req, res) => {
  try {
    await pool.query('UPDATE farmers SET is_active = false WHERE id = $1', [req.params.id]);
    res.json({ success: true, message: 'Farmer deactivated.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
