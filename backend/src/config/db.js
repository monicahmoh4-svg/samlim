const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const connectDB = async () => {
  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL environment variable is not set.');
    console.error('   Add your Neon connection string in the Render dashboard → Environment tab.');
    process.exit(1);
  }
  try {
    const client = await pool.connect();
    console.log('✅ Neon PostgreSQL connected');
    await initTables(client);
    client.release();
  } catch (err) {
    console.error('❌ Database connection error:', err.message);
    process.exit(1);
  }
};

const initTables = async (client) => {
  await client.query(`
    CREATE TABLE IF NOT EXISTS farmers (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      full_name   TEXT NOT NULL,
      phone       TEXT UNIQUE NOT NULL,
      national_id TEXT,
      pin         TEXT,
      county      TEXT NOT NULL,
      sub_county  TEXT,
      village     TEXT,
      primary_crop TEXT,
      land_size   NUMERIC,
      role        TEXT DEFAULT 'farmer',
      is_verified BOOLEAN DEFAULT false,
      is_active   BOOLEAN DEFAULT true,
      total_earned NUMERIC DEFAULT 0,
      total_sales  INT DEFAULT 0,
      notes       TEXT,
      created_at  TIMESTAMPTZ DEFAULT NOW(),
      updated_at  TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS hubs (
      id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name                  TEXT NOT NULL,
      county                TEXT NOT NULL,
      sub_county            TEXT,
      operator_name         TEXT,
      operator_phone        TEXT,
      capacity_tons_per_week NUMERIC DEFAULT 2,
      is_active             BOOLEAN DEFAULT true,
      is_full               BOOLEAN DEFAULT false,
      monthly_revenue       NUMERIC DEFAULT 0,
      farmer_count          INT DEFAULT 0,
      notes                 TEXT,
      created_at            TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS listings (
      id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      product_name     TEXT NOT NULL,
      category         TEXT DEFAULT 'other',
      processing_type  TEXT DEFAULT 'fresh_raw',
      description      TEXT,
      quantity_kg      NUMERIC NOT NULL,
      quantity_left    NUMERIC,
      asking_price_kg  NUMERIC,
      farmer_id        UUID REFERENCES farmers(id),
      hub_name         TEXT,
      status           TEXT DEFAULT 'open',
      is_urgent        BOOLEAN DEFAULT false,
      expires_at       TIMESTAMPTZ,
      buyer_name       TEXT,
      sale_price_kg    NUMERIC,
      sale_date        TIMESTAMPTZ,
      sale_total       NUMERIC,
      views            INT DEFAULT 0,
      bid_count        INT DEFAULT 0,
      created_at       TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS bids (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      listing_id    UUID REFERENCES listings(id),
      buyer_name    TEXT,
      buyer_phone   TEXT,
      buyer_company TEXT,
      quantity      NUMERIC,
      price_per_kg  NUMERIC,
      total_value   NUMERIC,
      status        TEXT DEFAULT 'pending',
      message       TEXT,
      placed_at     TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS payments (
      id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      farmer_id            UUID REFERENCES farmers(id),
      farmer_name          TEXT,
      farmer_phone         TEXT,
      listing_id           UUID,
      hub_name             TEXT,
      amount_kes           NUMERIC NOT NULL,
      commission_kes       NUMERIC DEFAULT 0,
      net_to_farmer        NUMERIC,
      type                 TEXT DEFAULT 'sale_payment',
      description          TEXT,
      mpesa_ref            TEXT,
      mpesa_receipt        TEXT,
      mpesa_status         TEXT DEFAULT 'pending',
      mpesa_result_code    INT,
      mpesa_result_desc    TEXT,
      sms_sent             BOOLEAN DEFAULT false,
      initiated_at         TIMESTAMPTZ DEFAULT NOW(),
      completed_at         TIMESTAMPTZ,
      created_at           TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  console.log('✅ Database tables ready');
};

module.exports = { pool, connectDB };
