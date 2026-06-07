const express = require('express');
const router  = express.Router();
const { pool } = require('../config/db');
const { protect, restrictTo } = require('../middleware/auth');
const mpesa = require('../services/mpesa');
const sms   = require('../services/sms');

const normalize = (phone) =>
  phone.replace(/\s+/g, '').replace(/^\+/, '').replace(/^0/, '254');

// POST /api/payments/initiate
router.post('/initiate', protect, async (req, res) => {
  try {
    const { farmerPhone, amountKES, listingId, hubName, description } = req.body;
    if (!farmerPhone || !amountKES)
      return res.status(400).json({ success: false, message: 'Phone and amount required.' });

    const normalizedPhone = normalize(farmerPhone);
    const farmerResult = await pool.query(
      'SELECT id, full_name FROM farmers WHERE phone = $1',
      [normalizedPhone]
    );
    if (!farmerResult.rows.length)
      return res.status(404).json({ success: false, message: 'Farmer not found.' });

    const farmer = farmerResult.rows[0];
    const commission  = Math.round(Number(amountKES) * 0.025);
    const netToFarmer = Number(amountKES) - commission;

    const { rows } = await pool.query(
      `INSERT INTO payments (farmer_id, farmer_name, farmer_phone, listing_id,
        hub_name, amount_kes, commission_kes, net_to_farmer, description, mpesa_status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pending') RETURNING id`,
      [farmer.id, farmer.full_name, normalizedPhone, listingId || null,
       hubName, Number(amountKES), commission, netToFarmer,
       description || 'Produce sale payment']
    );
    const paymentId = rows[0].id;

    // Trigger M-Pesa STK Push
    let mpesaResponse;
    try {
      mpesaResponse = await mpesa.stkPush({
        phone: normalizedPhone,
        amount: netToFarmer,
        accountRef: `SAMLIM-${paymentId.toString().slice(-6).toUpperCase()}`,
        description: description || 'SAM-LiMP produce sale',
      });
      await pool.query(
        'UPDATE payments SET mpesa_ref = $1 WHERE id = $2',
        [mpesaResponse.MerchantRequestID, paymentId]
      );
    } catch (mpesaErr) {
      await pool.query(
        "UPDATE payments SET mpesa_status = 'failed', mpesa_result_desc = $1 WHERE id = $2",
        [mpesaErr.message, paymentId]
      );
      return res.status(502).json({
        success: false,
        message: 'M-Pesa request failed. Please try again.',
        paymentId,
      });
    }

    res.status(201).json({
      success: true,
      message: `M-Pesa STK Push sent to ${farmer.full_name}. Awaiting confirmation.`,
      data: { paymentId, amountKES, commission, netToFarmer },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/payments/mpesa-callback — Safaricom calls this
router.post('/mpesa-callback', async (req, res) => {
  try {
    const callback = req.body?.Body?.stkCallback;
    if (!callback) return res.json({ ResultCode: 0, ResultDesc: 'Accepted' });

    const { MerchantRequestID, ResultCode, ResultDesc, CallbackMetadata } = callback;

    const payResult = await pool.query(
      'SELECT * FROM payments WHERE mpesa_ref = $1',
      [MerchantRequestID]
    );
    if (!payResult.rows.length)
      return res.json({ ResultCode: 0, ResultDesc: 'Accepted' });

    const payment = payResult.rows[0];

    if (ResultCode === 0) {
      const items  = CallbackMetadata?.Item || [];
      const receipt = items.find(i => i.Name === 'MpesaReceiptNumber')?.Value;

      await pool.query(
        `UPDATE payments SET mpesa_status = 'success', mpesa_receipt = $1,
          mpesa_result_code = 0, mpesa_result_desc = $2, completed_at = NOW()
         WHERE id = $3`,
        [receipt, ResultDesc, payment.id]
      );
      await pool.query(
        `UPDATE farmers SET
          total_earned = total_earned + $1,
          total_sales  = total_sales + 1
         WHERE id = $2`,
        [payment.net_to_farmer, payment.farmer_id]
      );
      await sms.send(
        payment.farmer_phone,
        `SAM-LiMP ✅ KES ${payment.net_to_farmer.toLocaleString()} received! Ref: ${receipt || 'N/A'}. Keep farming and earning more!`
      );
    } else {
      await pool.query(
        "UPDATE payments SET mpesa_status = 'failed', mpesa_result_code = $1, mpesa_result_desc = $2 WHERE id = $3",
        [ResultCode, ResultDesc, payment.id]
      );
    }

    res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
  } catch (err) {
    console.error('M-Pesa callback error:', err);
    res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
  }
});

// GET /api/payments/status/:id
router.get('/status/:id', protect, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM payments WHERE id = $1', [req.params.id]);
    if (!rows.length)
      return res.status(404).json({ success: false, message: 'Payment not found.' });
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/payments/my
router.get('/my', protect, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM payments WHERE farmer_id = $1 ORDER BY created_at DESC LIMIT 50',
      [req.user.id]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/payments — admin
router.get('/', protect, restrictTo('admin'), async (req, res) => {
  try {
    const { status, page = 1, limit = 50 } = req.query;
    let q = 'SELECT p.*, f.full_name as farmer_name FROM payments p LEFT JOIN farmers f ON p.farmer_id = f.id WHERE 1=1';
    const params = [];
    if (status) { params.push(status); q += ` AND p.mpesa_status = $${params.length}`; }
    q += ` ORDER BY p.created_at DESC LIMIT $${params.length+1} OFFSET $${params.length+2}`;
    params.push(Number(limit), (page - 1) * Number(limit));

    const { rows } = await pool.query(q, params);
    const agg = await pool.query(
      "SELECT SUM(net_to_farmer) as total, SUM(commission_kes) as commission FROM payments WHERE mpesa_status = 'success'"
    );
    const total = (await pool.query('SELECT COUNT(*) FROM payments')).rows[0].count;

    res.json({
      success: true,
      total: Number(total),
      totalDisbursed:  Number(agg.rows[0].total    || 0),
      totalCommission: Number(agg.rows[0].commission || 0),
      data: rows,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
