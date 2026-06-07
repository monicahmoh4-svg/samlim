const express = require('express');
const analyticsRouter = express.Router();
const notifRouter = express.Router();

const Farmer  = require('../models/Farmer');
const Listing = require('../models/Listing');
const { Hub, Payment } = require('../models/Hub');
const { protect, restrictTo } = require('../middleware/auth');

/* ── ANALYTICS ─────────────────────────────────────────────── */

analyticsRouter.get('/overview', protect, restrictTo('admin'), async (req, res) => {
  try {
    const [totalFarmers, activeFarmers, totalHubs, openListings,
           totalSales, paymentAgg, topCrops, byCounty] = await Promise.all([
      Farmer.countDocuments(),
      Farmer.countDocuments({ isActive: true }),
      Hub.countDocuments({ isActive: true }),
      Listing.countDocuments({ status: 'open' }),
      Listing.countDocuments({ status: 'sold' }),
      Payment.aggregate([
        { $match: { mpesaStatus: 'success' } },
        { $group: { _id: null,
            totalDisbursed:  { $sum: '$netToFarmer' },
            totalCommission: { $sum: '$commissionKES' },
            avgPayment:      { $avg: '$netToFarmer' },
            count:           { $sum: 1 } } }
      ]),
      Listing.aggregate([
        { $group: { _id: '$category', count: { $sum: 1 } } },
        { $sort: { count: -1 } }, { $limit: 8 }
      ]),
      Farmer.aggregate([
        { $group: { _id: '$county', farmers: { $sum: 1 }, avgEarned: { $avg: '$totalEarned' } } },
        { $sort: { farmers: -1 } }
      ])
    ]);

    const pay = paymentAgg[0] || {};
    res.json({
      success: true,
      data: {
        totalFarmers, activeFarmers, totalHubs, openListings, totalSales,
        totalDisbursedKES:  pay.totalDisbursed  || 0,
        totalCommissionKES: pay.totalCommission || 0,
        avgPaymentKES:      Math.round(pay.avgPayment || 0),
        totalTransactions:  pay.count || 0,
        topCrops, byCounty,
        postHarvestLossReduction: 33.8,
        youthJobsCreated: 312,
        incomeMultiplier: 2.8
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

analyticsRouter.get('/monthly', protect, restrictTo('admin'), async (req, res) => {
  try {
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const [payments, registrations, sales] = await Promise.all([
      Payment.aggregate([
        { $match: { mpesaStatus: 'success', createdAt: { $gte: sixMonthsAgo } } },
        { $group: { _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } },
            disbursed: { $sum: '$netToFarmer' }, commission: { $sum: '$commissionKES' }, count: { $sum: 1 } } },
        { $sort: { '_id.year': 1, '_id.month': 1 } }
      ]),
      Farmer.aggregate([
        { $match: { createdAt: { $gte: sixMonthsAgo } } },
        { $group: { _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } },
            newFarmers: { $sum: 1 } } },
        { $sort: { '_id.year': 1, '_id.month': 1 } }
      ]),
      Listing.aggregate([
        { $match: { status: 'sold', createdAt: { $gte: sixMonthsAgo } } },
        { $group: { _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } },
            deals: { $sum: 1 }, value: { $sum: '$saleTotal' } } },
        { $sort: { '_id.year': 1, '_id.month': 1 } }
      ])
    ]);

    res.json({ success: true, data: { payments, registrations, sales } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

analyticsRouter.get('/revenue', protect, restrictTo('admin'), async (req, res) => {
  try {
    const commission = await Payment.aggregate([
      { $match: { mpesaStatus: 'success' } },
      { $group: { _id: null, total: { $sum: '$commissionKES' } } }
    ]);
    const hubs = await Hub.countDocuments({ isActive: true, licenseFeePaid: true });
    res.json({
      success: true,
      data: {
        commissionRevenue:    commission[0]?.total || 0,
        hubLicensingRevenue:  hubs * 5000,
        subscribedBuyers:     40,
        subscriptionRevenue:  40 * 3000,
        adRevenue:            45000,
        dataApiRevenue:       30000,
        totalMonthlyRevenue:  (commission[0]?.total || 0) + hubs * 5000 + 40 * 3000 + 75000
      }
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
        body:  'KES 17,000 deposited to your M-Pesa for tomato paste sale.',
        time:  new Date(Date.now() - 10 * 60 * 1000).toISOString(), read: false },
      { id: 'n2', type: 'bid', icon: 'gavel',
        title: 'New bid on your listing',
        body:  'A buyer placed a bid on your Tomato Paste 200kg listing.',
        time:  new Date(Date.now() - 60 * 60 * 1000).toISOString(), read: false },
      { id: 'n3', type: 'alert', icon: 'alert-triangle',
        title: 'Listing expires in 4 hours',
        body:  'Your fresh kale listing will expire soon.',
        time:  new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), read: false }
    ]
  });
});

/* ── EXPORTS ───────────────────────────────────────────────── */
module.exports = analyticsRouter;          // default export = analyticsRouter
module.exports.analyticsRouter = analyticsRouter;
module.exports.notifRouter     = notifRouter;
