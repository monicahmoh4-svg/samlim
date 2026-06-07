require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
const connectDB = require('./src/config/db');

// Route imports
const authRoutes = require('./src/routes/auth');
const farmerRoutes = require('./src/routes/farmers');
const listingRoutes = require('./src/routes/listings');
const hubRoutes = require('./src/routes/hubs');
const paymentRoutes = require('./src/routes/payments');
const analyticsRoutes = require('./src/routes/analytics');
const notificationRoutes = require('./src/routes/notifications');

const app = express();

// ─── Connect Database ────────────────────────────────────
connectDB();

// ─── Security Middleware ─────────────────────────────────
app.use(helmet());
app.use(mongoSanitize());

// ─── CORS ────────────────────────────────────────────────
app.use(cors({
  origin: [
    process.env.FRONTEND_URL,
    'http://localhost:3000',
    'http://localhost:5500',
    'http://127.0.0.1:5500',
    // Allow file:// for local HTML opening
    null,
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
}));

// ─── Rate Limiting ───────────────────────────────────────
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  message: { success: false, message: 'Too many requests, please try again later.' },
});
app.use('/api', limiter);

// Stricter limit for auth routes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { success: false, message: 'Too many auth attempts, please try again later.' },
});
app.use('/api/auth', authLimiter);

// ─── Body Parsing ─────────────────────────────────────────
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// ─── Logging ─────────────────────────────────────────────
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// ─── Health Check ─────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'SAM-LiMP API',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

// ─── API Routes ───────────────────────────────────────────
app.use('/api/auth',          authRoutes);
app.use('/api/farmers',       farmerRoutes);
app.use('/api/listings',      listingRoutes);
app.use('/api/hubs',          hubRoutes);
app.use('/api/payments',      paymentRoutes);
app.use('/api/analytics',     analyticsRoutes);
app.use('/api/notifications', notificationRoutes);

// ─── 404 Handler ──────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.originalUrl} not found` });
});

// ─── Global Error Handler ─────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Error:', err.message);
  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    success: false,
    message: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

// ─── Start Server ─────────────────────────────────────────
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`\n🌿 SAM-LiMP API running on port ${PORT}`);
  console.log(`   Environment: ${process.env.NODE_ENV}`);
  console.log(`   Health: http://localhost:${PORT}/health\n`);
});

module.exports = app;
