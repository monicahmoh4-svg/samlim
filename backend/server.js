require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
const connectDB = require('./src/config/db');

const authRoutes        = require('./src/routes/auth');
const farmerRoutes      = require('./src/routes/farmers');
const listingRoutes     = require('./src/routes/listings');
const hubRoutes         = require('./src/routes/hubs');
const paymentRoutes     = require('./src/routes/payments');
const analyticsRoutes   = require('./src/routes/analytics');
const notifRoutes       = require('./src/routes/notifications');

const app = express();

connectDB();

app.use(helmet());
app.use(mongoSanitize());
app.use(cors({ origin: '*', credentials: true }));

app.use(
  rateLimit({ windowMs: 15 * 60 * 1000, max: 200,
    message: { success: false, message: 'Too many requests.' } })
);

app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

if (process.env.NODE_ENV !== 'production') app.use(morgan('dev'));

app.get('/',       (req, res) => res.json({ status: 'ok', service: 'SAM-LiMP API' }));
app.get('/health', (req, res) => res.json({ status: 'ok', service: 'SAM-LiMP API' }));

app.use('/api/auth',          authRoutes);
app.use('/api/farmers',       farmerRoutes);
app.use('/api/listings',      listingRoutes);
app.use('/api/hubs',          hubRoutes);
app.use('/api/payments',      paymentRoutes);
app.use('/api/analytics',     analyticsRoutes);
app.use('/api/notifications', notifRoutes);

app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.originalUrl} not found` });
});

app.use((err, req, res, next) => {
  console.error(err.message);
  res.status(err.statusCode || 500).json({ success: false, message: err.message || 'Server error' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`SAM-LiMP API running on port ${PORT}`);
});

module.exports = app;
