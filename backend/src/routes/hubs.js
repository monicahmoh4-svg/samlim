const express = require('express');
const router = express.Router();
const { Hub } = require('../models/Hub');
const { protect, restrictTo } = require('../middleware/auth');

// GET /api/hubs — public list
router.get('/', async (req, res) => {
  try {
    const { county, active = 'true' } = req.query;
    const filter = {};
    if (active === 'true') filter.isActive = true;
    if (county) filter.county = new RegExp(county, 'i');

    const hubs = await Hub.find(filter)
      .populate('operator', 'fullName phone')
      .sort({ farmerCount: -1 });

    res.json({ success: true, data: hubs });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/hubs/:id
router.get('/:id', async (req, res) => {
  try {
    const hub = await Hub.findById(req.params.id).populate('operator', 'fullName phone county');
    if (!hub) return res.status(404).json({ success: false, message: 'Hub not found.' });
    res.json({ success: true, data: hub });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/hubs — Admin: create hub
router.post('/', protect, restrictTo('admin'), async (req, res) => {
  try {
    const hub = await Hub.create(req.body);
    res.status(201).json({ success: true, data: hub });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// PATCH /api/hubs/:id — Admin or operator
router.patch('/:id', protect, async (req, res) => {
  try {
    const hub = await Hub.findById(req.params.id);
    if (!hub) return res.status(404).json({ success: false, message: 'Hub not found.' });

    const isOperator = hub.operator?.toString() === req.user._id.toString();
    if (req.user.role !== 'admin' && !isOperator) {
      return res.status(403).json({ success: false, message: 'Not authorized.' });
    }

    const updated = await Hub.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// POST /api/hubs/apply — Hub application (public)
router.post('/apply', async (req, res) => {
  try {
    const { applicantName, phone, county, village, farmerEstimate, crops, motivation } = req.body;
    if (!applicantName || !phone || !county) {
      return res.status(400).json({ success: false, message: 'Name, phone and county are required.' });
    }
    // In production: store to HubApplication collection + email admin
    console.log('Hub application received:', { applicantName, phone, county, village, farmerEstimate });
    res.json({
      success: true,
      message: 'Application received! We will contact you within 48 hours.',
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
