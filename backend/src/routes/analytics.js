const express = require('express');
const analyticsRouter = express.Router();
const notifRouter     = express.Router();
const { pool } = require('../config/db');
const { protect, restrictTo } = require('../middleware/auth');

/* ── ANALYTICS ─────────────────────────────────────────────── */

analyticsRouter.get('/overview', protect, restrictTo('admin'), async (req, res) => {
  try {
    const [
      totalFarmers,
      activeFarmers,
      totalHubs,
      openListings,
      totalSales,
      payAgg,
      byCounty,
    ] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM farmers'),
      pool.query('SELECT COUNT(*) FROM farmers WHERE is_active = true'),
      pool.query('SELECT COUNT(*) FROM hubs WHERE is_active = true'),
      pool.query("SELECT COUNT(*) FROM listings WHERE status = 'open'"),
      pool.query("SELECT COUNT(*) FROM listings WHERE status = 'sold'"),
      pool.query(`SELECT
        SUM(net_to_farmer)  AS total_disbursed,
        SUM(commission_kes) AS total_commission,
        AVG(net_to_farmer)  AS avg_payment,
        COUNT(*)            AS txn_count
        FROM payments WHERE mpesa_status = 'success'`),
      pool.query('SELECT county, COUNT(*) as farmers FROM farmers GROUP BY county ORDER BY farmers DESC'),
    ]);

    const pay = payAgg.rows[0];
    res.json({
      success: true,
      data: {
        totalFarmers:       Number(totalFarmers.rows[0].count),
        activeFarmers:      Number(activeFarmers.rows[0].count),
        totalHubs:          Number(totalHubs.rows[0].count),
        openListings:       Number(openListings.rows[0].count),
        totalSales:         Number(totalSales.rows[0].count),
        totalDisbursedKES:  Number(pay.total_disbursed  || 0),
        totalCommissionKES: Number(pay.total_commission || 0),
        avgPaymentKES:      Math.round(Number(pay.avg_payment || 0)),
        totalTransactions:  Number(pay.txn_count || 0),
        byCounty:           byCounty.rows,
        postHarvestLossReduction: 33.8,
        youthJobsCreated:   312,
        incomeMultiplier:   2.8,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

analyticsRouter.get('/monthly', protect, restrictTo('admin'), async (req, res) => {
  try {
    const [payments, registrations] = await Promise.all([
      pool.query(`
        SELECT
          EXTRACT(YEAR  FROM created_at) AS year,
          EXTRACT(MONTH FROM created_at) AS month,
          SUM(net_to_farmer)  AS disbursed,
          SUM(commission_kes) AS commission,
          COUNT(*)            AS count
        FROM payments
        WHERE mpesa_status = 'success'
          AND created_at >= NOW() - INTERVAL '6 months'
        GROUP BY year, month ORDER BY year, month`),
      pool.query(`
        SELECT
          EXTRACT(YEAR  FROM created_at) AS year,
          EXTRACT(MONTH FROM created_at) AS month,
          COUNT(*) AS new_farmers
        FROM farmers
        WHERE created_at >= NOW() - INTERVAL '6 months'
        GROUP BY year, month ORDER BY year, month`),
    ]);
    res.json({ success: true, data: { payments: payments.rows, registrations: registrations.rows } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

analyticsRouter.get('/revenue', protect, restrictTo('admin'), async (req, res) => {
  try {
    const comm = await pool.query(
      "SELECT SUM(commission_kes) AS total FROM payments WHERE mpesa_status = 'success'"
    );
    const hubs = await pool.query('SELECT COUNT(*) FROM hubs WHERE is_active = true');
    const hubCount = Number(hubs.rows[0].count);
    const commTotal = Number(comm.rows[0].total || 0);
    res.json({
      success: true,
      data: {
        commissionRevenue:   commTotal,
        hubLicensingRevenue: hubCount * 5000,
        subscriptionRevenue: 40 * 3000,
        adRevenue:           45000,
        dataApiRevenue:      30000,
        totalMonthlyRevenue: commTotal + hubCount * 5000 + 40 * 3000 + 75000,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/* ── NOTIFICATIONS ─────────────────────────────────────────── */

notifRouter.get('/', protect, async (req, res) => {
  res.json({
    success: true,
    data: [
      { id: 'n1', type: 'payment', icon: 'cash',
        title: 'Payment received!',
        body: 'KES 17,000 deposited to your M-Pesa for tomato paste sale.',
        time: new Date(Date.now() - 10 * 60 * 1000).toISOString(), read: false },
      { id: 'n2', type: 'bid', icon: 'gavel',
        title: 'New bid on your listing',
        body: 'A buyer placed a bid on your Tomato Paste 200kg listing.',
        time: new Date(Date.now() - 60 * 60 * 1000).toISOString(), read: false },
      { id: 'n3', type: 'alert', icon: 'alert-triangle',
        title: 'Listing expires in 4 hours',
        body: 'Your fresh kale listing will expire soon.',
        time: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), read: false },
    ],
  });
});

/* ── EXPORTS ───────────────────────────────────────────────── */
module.exports = analyticsRouter;
module.exports.analyticsRouter = analyticsRouter;
module.exports.notifRouter     = notifRouter;
