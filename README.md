# SAM-LiMP — Smart Agro-Market Linkage & Micro-Processing System

> Connecting smallholder farmers to direct buyers via mobile payments. Eliminating middlemen, reducing post-harvest loss, and multiplying farmer income.

---

## 🌿 Project Structure

```
samlim/
├── backend/              # Node.js + Express API
│   ├── src/
│   │   ├── routes/       # API route handlers
│   │   ├── models/       # Mongoose data models
│   │   ├── middleware/   # Auth, validation, error handling
│   │   ├── services/     # M-Pesa, SMS, business logic
│   │   └── config/       # DB, environment config
│   ├── package.json
│   └── server.js
├── frontend/
│   ├── consumer/         # Farmer & buyer mobile-first app
│   │   └── index.html    # Single HTML file, deployable on Vercel/Netlify
│   └── admin/            # Platform admin dashboard
│       └── index.html
├── docs/
│   └── API.md            # API documentation
└── README.md
```

---

## 🚀 Quick Start

### 1. Clone the repository
```bash
git clone https://github.com/YOUR_USERNAME/samlim.git
cd samlim
```

### 2. Backend setup
```bash
cd backend
cp .env.example .env         # Fill in your credentials
npm install
npm run dev                  # Starts on http://localhost:5000
```

### 3. Frontend
Open `frontend/consumer/index.html` in your browser — or deploy to Vercel/Netlify directly.

---

## ⚙️ Environment Variables (backend/.env)

```env
PORT=5000
MONGODB_URI=mongodb+srv://USER:PASS@cluster.mongodb.net/samlim
JWT_SECRET=your_super_secret_jwt_key_here
JWT_EXPIRES_IN=30d

# Safaricom M-Pesa Daraja API
MPESA_CONSUMER_KEY=your_consumer_key
MPESA_CONSUMER_SECRET=your_consumer_secret
MPESA_SHORTCODE=174379
MPESA_PASSKEY=your_lipa_na_mpesa_passkey
MPESA_CALLBACK_URL=https://your-domain.com/api/payments/mpesa-callback
MPESA_ENV=sandbox   # or 'production'

# Africa's Talking SMS
AT_API_KEY=your_at_api_key
AT_USERNAME=sandbox   # or your username
AT_SENDER_ID=SAM-LiMP

# Frontend URL (for CORS)
FRONTEND_URL=http://localhost:3000
```

---

## 🌍 Deployment

### Backend → Railway / Render
1. Push repo to GitHub
2. Connect Railway (railway.app) to your GitHub repo
3. Set environment variables in Railway dashboard
4. Railway auto-deploys on every push to `main`

### Frontend → Vercel / Netlify
1. Drag & drop `frontend/consumer/index.html` to Netlify
2. Or: `vercel deploy frontend/consumer/`
3. Update `API_BASE_URL` in the HTML to point to your Railway backend URL

### Database → MongoDB Atlas (free tier)
1. Create account at mongodb.com/atlas
2. Create a free M0 cluster
3. Get connection string → paste into `MONGODB_URI`

---

## 📱 Features

### Consumer App (Farmers & Buyers)
- ✅ Farmer registration with M-Pesa phone
- ✅ Post produce listings (raw or processed)
- ✅ Browse & bid on marketplace listings
- ✅ Processing hub finder with distance
- ✅ M-Pesa STK Push payment initiation
- ✅ Payment history & earnings tracking
- ✅ SMS notifications via Africa's Talking
- ✅ Offline-friendly (localStorage caching)

### Admin Dashboard (Platform Owner)
- ✅ Real-time KPI overview
- ✅ Farmer management & registration
- ✅ Hub directory & operator management
- ✅ Revenue model projector
- ✅ Analytics with charts
- ✅ Investor pitch view

### Backend API
- ✅ JWT authentication
- ✅ Farmer CRUD
- ✅ Produce listings & bidding
- ✅ M-Pesa Daraja integration (STK Push + callback)
- ✅ SMS notifications
- ✅ Hub management
- ✅ Analytics endpoints
- ✅ Rate limiting & security headers

---

## 📞 Support
Email: support@samlim.co.ke | Phone: +254 700 000 000
