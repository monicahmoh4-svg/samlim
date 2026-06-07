const express = require('express');
const router = express.Router();
const Farmer = require('../models/Farmer');
const { Payment } = require('../models/Hub');
const { protect, restrictTo } = require('../middleware/auth');

// ─── GET /api/farmers ─── Admin: list all farmers
router.get('/', protect, restrictTo('admin', 'hub_operator'), async (req, res) => {
  try {
    const { county, crop, status, page = 1, limit = 50 } = req.query;
    const filter = {};
    if (county) filter.county = new RegExp(county, 'i');
    if (crop) filter.primaryCrop = new RegExp(crop, 'i');
    if (status === 'active') filter.isActive = true;
    if (status === 'inactive') filter.isActive = false;

    const farmers = await Farmer.find(filter)
      .select('-pin')
      .populate('nearestHub', 'name county')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    const total = await Farmer.countDocuments(filter);

    res.json({ success: true, total, page: Number(page), data: farmers });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── GET /api/farmers/stats ─── Platform-wide farmer stats
router.get('/stats', protect, restrictTo('admin'), async (req, res) => {
  try {
    const [total, active, byCounty, byRole, totalEarned] = await Promise.all([
      Farmer.countDocuments(),
      Farmer.countDocuments({ isActive: true }),
      Farmer.aggregate([
        { $group: { _id: '$county', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      Farmer.aggregate([
        { $group: { _id: '$role', count: { $sum: 1 } } },
      ]),
      Farmer.aggregate([
        { $group: { _id: null, total: { $sum: '$totalEarned' } } },
      ]),
    ]);

    res.json({
      success: true,
      data: {
        total, active,
        byCounty,
        byRole,
        totalEarnedByFarmers: totalEarned[0]?.total || 0,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── GET /api/farmers/:id ─── Get single farmer
router.get('/:id', protect, async (req, res) => {
  try {
    const farmer = await Farmer.findById(req.params.id)
      .select('-pin')
      .populate('nearestHub', 'name county operatorName');

    if (!farmer) return res.status(404).json({ success: false, message: 'Farmer not found.' });

    // Only admin or the farmer themselves
    if (req.user.role !== 'admin' && req.user._id.toString() !== req.params.id) {
      return res.status(403).json({ success: false, message: 'Not authorized.' });
    }

    // Get recent payments
    const payments = await Payment.find({ farmer: farmer._id })
      .sort({ createdAt: -1 })
      .limit(10);

    res.json({ success: true, data: { ...farmer.toJSON(), recentPayments: payments } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── PATCH /api/farmers/:id ─── Update farmer (admin or self)
router.patch('/:id', protect, async (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user._id.toString() !== req.params.id) {
      return res.status(403).json({ success: false, message: 'Not authorized.' });
    }
    const farmer = await Farmer.findByIdAndUpdate(req.params.id, req.body, {
      new: true, runValidators: true,
    }).select('-pin');

    if (!farmer) return res.status(404).json({ success: false, message: 'Farmer not found.' });
    res.json({ success: true, data: farmer });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// ─── DELETE /api/farmers/:id ─── Admin only: deactivate
router.delete('/:id', protect, restrictTo('admin'), async (req, res) => {
  try {
    await Farmer.findByIdAndUpdate(req.params.id, { isActive: false });
    res.json({ success: true, message: 'Farmer deactivated.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
