# SAM-LiMP API Documentation

Base URL: `http://localhost:5000/api` (dev) | `https://your-backend.railway.app/api` (prod)

All protected routes require: `Authorization: Bearer <token>`

---

## Auth

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/auth/register` | No | Register farmer/buyer |
| POST | `/auth/login` | No | Login with phone + PIN |
| GET | `/auth/me` | Yes | Get current user profile |
| PATCH | `/auth/update-profile` | Yes | Update profile fields |

### Register body
```json
{
  "fullName": "Jane Wambui",
  "phone": "0712000000",
  "county": "Kiambu",
  "primaryCrop": "Tomatoes",
  "landSize": 3,
  "pin": "1234",
  "role": "farmer"
}
```

### Login body
```json
{ "phone": "0712000000", "pin": "1234" }
```

---

## Farmers

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/farmers` | Admin | List all farmers |
| GET | `/farmers/stats` | Admin | Platform farmer stats |
| GET | `/farmers/:id` | Yes | Get single farmer |
| PATCH | `/farmers/:id` | Yes | Update farmer |
| DELETE | `/farmers/:id` | Admin | Deactivate farmer |

---

## Listings

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/listings` | No | Browse open listings |
| POST | `/listings` | Yes | Create new listing |
| GET | `/listings/:id` | No | Get listing + bids |
| POST | `/listings/:id/bid` | Yes | Place bid |
| POST | `/listings/:id/accept-bid/:bidId` | Yes | Accept a bid |
| GET | `/listings/my/listings` | Yes | My listings |
| PATCH | `/listings/:id` | Yes | Update listing |
| DELETE | `/listings/:id` | Yes | Cancel listing |

### Create listing body
```json
{
  "productName": "Tomato paste",
  "category": "processed",
  "processingType": "paste_sauce",
  "quantityKg": 200,
  "askingPriceKg": 85,
  "hubName": "Kiambu Hub 2",
  "isUrgent": false,
  "description": "Grade A, packed in 5kg containers"
}
```

### Place bid body
```json
{
  "quantity": 100,
  "pricePerKg": 88,
  "buyerCompany": "Naivas Distributors",
  "message": "Ready for collection Monday"
}
```

---

## Hubs

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/hubs` | No | List all hubs |
| GET | `/hubs/:id` | No | Hub details |
| POST | `/hubs` | Admin | Create hub |
| PATCH | `/hubs/:id` | Admin/Op | Update hub |
| POST | `/hubs/apply` | No | Hub application |

---

## Payments

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/payments/initiate` | Yes | STK Push to farmer |
| POST | `/payments/mpesa-callback` | No | Safaricom webhook |
| GET | `/payments/status/:id` | Yes | Poll payment status |
| GET | `/payments/my` | Yes | My payment history |
| GET | `/payments` | Admin | All payments |

### Initiate payment body
```json
{
  "farmerPhone": "0712000000",
  "amountKES": 17000,
  "listingId": "...",
  "hubName": "Kiambu Hub 2",
  "description": "Tomato paste sale"
}
```

---

## Analytics

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/analytics/overview` | Admin | Platform KPIs |
| GET | `/analytics/monthly` | Admin | Monthly trends |
| GET | `/analytics/revenue` | Admin | Revenue breakdown |

---

## Notifications

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/notifications` | Yes | User notifications |

---

## Category values
`grains` | `vegetables` | `fruits` | `oils` | `processed` | `fresh` | `other`

## Processing type values
`fresh_raw` | `dried` | `milled` | `paste_sauce` | `chips_sliced` | `roasted` | `cold_pressed` | `packaged` | `other`

## Role values
`farmer` | `buyer` | `hub_operator` | `admin`
