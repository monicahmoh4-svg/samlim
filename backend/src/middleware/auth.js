const jwt = require('jsonwebtoken');
const Farmer = require('../models/Farmer');

// Protect routes — require valid JWT
exports.protect = async (req, res, next) => {
  try {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({ success: false, message: 'Not authenticated. Please log in.' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const farmer = await Farmer.findById(decoded.id).select('-pin');

    if (!farmer || !farmer.isActive) {
      return res.status(401).json({ success: false, message: 'User no longer exists or is inactive.' });
    }

    req.user = farmer;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Invalid or expired token.' });
  }
};

// Restrict to certain roles
exports.restrictTo = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ success: false, message: 'You do not have permission for this action.' });
  }
  next();
};

// Sign JWT helper
exports.signToken = (id) => jwt.sign({ id }, process.env.JWT_SECRET, {
  expiresIn: process.env.JWT_EXPIRES_IN || '30d',
});
