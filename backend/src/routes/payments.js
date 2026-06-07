const express = require('express');
const router = express.Router();
const { Payment } = require('../models/Hub');
const Farmer = require('../models/Farmer');
const { protect, restrictTo } = require('../middleware/auth');
const mpesa = require('../services/mpesa');
const smsService = require('../services/sms');

// ─── POST /api/payments/initiate ─── Initiate M-Pesa STK Push
router.post('/initiate', protect, async (req, res) => {
  try {
    const { farmerPhone, amountKES, listingId, hubId, hubName, description } = req.body;

    if (!farmerPhone || !amountKES) {
      return res.status(400).json({ success: false, message: 'Phone and amount are required.' });
    }

    // Find the farmer
    const normalizedPhone = farmerPhone.replace(/\s+/g, '').replace(/^0/, '254').replace(/^\+/, '');
    const farmer = await Farmer.findOne({ phone: normalizedPhone });
    if (!farmer) return res.status(404).json({ success: false, message: 'Farmer not found.' });

    const commission = Math.round(amountKES * 0.025);
    const netToFarmer = amountKES - commission;

    // Create payment record
    const payment = await Payment.create({
      farmer: farmer._id,
      farmerName: farmer.fullName,
      farmerPhone: normalizedPhone,
      listing: listingId,
      hub: hubId,
      hubName,
      amountKES: Number(amountKES),
      commissionKES: commission,
      netToFarmer,
      description: description || 'Produce sale payment',
      mpesaStatus: 'pending',
    });

    // Trigger STK Push
    let mpesaResponse;
    try {
      mpesaResponse = await mpesa.stkPush({
        phone: normalizedPhone,
        amount: netToFarmer,
        accountRef: `SAMLIM-${payment._id.toString().slice(-6).toUpperCase()}`,
        description: `SAM-LiMP: ${description || 'Produce sale'}`,
      });

      payment.mpesaRef = mpesaResponse.MerchantRequestID;
      await payment.save();
    } catch (mpesaErr) {
      // M-Pesa error — still return payment ID for retry
      console.error('M-Pesa STK error:', mpesaErr.message);
      payment.mpesaStatus = 'failed';
      payment.mpesaResultDesc = mpesaErr.message;
      await payment.save();
      return res.status(502).json({
        success: false,
        message: 'M-Pesa request failed. Please try again.',
        paymentId: payment._id,
      });
    }

    res.status(201).json({
      success: true,
      message: `M-Pesa STK Push sent to ${farmer.fullName} (${normalizedPhone}). Awaiting confirmation.`,
      data: {
        paymentId: payment._id,
        merchantRequestId: mpesaResponse.MerchantRequestID,
        checkoutRequestId: mpesaResponse.CheckoutRequestID,
        amountKES,
        commission,
        netToFarmer,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── POST /api/payments/mpesa-callback ─── Safaricom calls this
router.post('/mpesa-callback', async (req, res) => {
  try {
    const callbackData = req.body?.Body?.stkCallback;
    if (!callbackData) {
      return res.status(400).json({ ResultCode: 1, ResultDesc: 'Bad request' });
    }

    const { MerchantRequestID, CheckoutRequestID, ResultCode, ResultDesc, CallbackMetadata } = callbackData;

    const payment = await Payment.findOne({ mpesaRef: MerchantRequestID });
    if (!payment) {
      console.warn('Payment not found for MerchantRequestID:', MerchantRequestID);
      return res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
    }

    payment.mpesaResultCode = ResultCode;
    payment.mpesaResultDesc = ResultDesc;
    payment.mpesaCallbackData = callbackData;

    if (ResultCode === 0) {
      // Success
      payment.mpesaStatus = 'success';
      payment.completedAt = new Date();

      // Extract receipt from metadata
      const items = CallbackMetadata?.Item || [];
      const receipt = items.find(i => i.Name === 'MpesaReceiptNumber')?.Value;
      if (receipt) payment.mpesaReceiptNumber = receipt;

      await payment.save();

      // Update farmer totals
      await Farmer.findByIdAndUpdate(payment.farmer, {
        $inc: { totalEarned: payment.netToFarmer, totalSales: 1 },
        lastPaymentDate: new Date(),
        lastPaymentAmt: payment.netToFarmer,
      });

      // Send confirmation SMS to farmer
      await smsService.send(
        payment.farmerPhone,
        `SAM-LiMP ✅ KES ${payment.netToFarmer.toLocaleString()} received! M-Pesa ref: ${receipt}. Keep farming and earning more!`
      );
    } else {
      payment.mpesaStatus = 'failed';
      await payment.save();

      // Notify farmer of failure
      await smsService.send(
        payment.farmerPhone,
        `SAM-LiMP: Payment of KES ${payment.amountKES.toLocaleString()} failed (${ResultDesc}). Contact support: +254 700 000 000`
      );
    }

    res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
  } catch (err) {
    console.error('M-Pesa callback error:', err);
    res.json({ ResultCode: 0, ResultDesc: 'Accepted' }); // Always acknowledge Safaricom
  }
});

// ─── GET /api/payments/status/:paymentId ─── Poll payment status
router.get('/status/:paymentId', protect, async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.paymentId).populate('farmer', 'fullName phone');
    if (!payment) return res.status(404).json({ success: false, message: 'Payment not found.' });
    res.json({ success: true, data: payment });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── GET /api/payments/my ─── Farmer's own payment history
router.get('/my', protect, async (req, res) => {
  try {
    const payments = await Payment.find({ farmer: req.user._id })
      .sort({ createdAt: -1 })
      .limit(50);
    res.json({ success: true, data: payments });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── GET /api/payments ─── Admin: all payments
router.get('/', protect, restrictTo('admin'), async (req, res) => {
  try {
    const { status, page = 1, limit = 50 } = req.query;
    const filter = {};
    if (status) filter.mpesaStatus = status;

    const payments = await Payment.find(filter)
      .populate('farmer', 'fullName phone county')
      .populate('hub', 'name')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    const total = await Payment.countDocuments(filter);
    const totalAmount = await Payment.aggregate([
      { $match: { mpesaStatus: 'success' } },
      { $group: { _id: null, total: { $sum: '$netToFarmer' }, commission: { $sum: '$commissionKES' } } },
    ]);

    res.json({
      success: true,
      total, page: Number(page),
      totalDisbursed: totalAmount[0]?.total || 0,
      totalCommission: totalAmount[0]?.commission || 0,
      data: payments,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
