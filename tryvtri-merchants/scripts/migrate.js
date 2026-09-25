import { pool, query } from '../lib/db.js';
import { env } from '../lib/env.js';

const SQL = `
CREATE TABLE IF NOT EXISTS merchants (
  id            SERIAL PRIMARY KEY,
  name          VARCHAR(60) NOT NULL,
  email         VARCHAR(255) NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE merchants ADD COLUMN IF NOT EXISTS email VARCHAR(255) NOT NULL DEFAULT '';

CREATE UNIQUE INDEX IF NOT EXISTS merchants_name_lower_idx ON merchants (lower(name));
CREATE UNIQUE INDEX IF NOT EXISTS merchants_email_lower_idx ON merchants (lower(email)) WHERE email <> '';

CREATE TABLE IF NOT EXISTS products (
  id           SERIAL PRIMARY KEY,
  merchant_id  INTEGER NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  name         TEXT NOT NULL DEFAULT '',
  url          TEXT NOT NULL,
  sku          TEXT NOT NULL DEFAULT '',
  image        TEXT NOT NULL DEFAULT '',
  qr_generated BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (merchant_id, url)
);

CREATE INDEX IF NOT EXISTS products_merchant_idx ON products (merchant_id);

CREATE TABLE IF NOT EXISTS qr_records (
  id           SERIAL PRIMARY KEY,
  merchant_id  INTEGER NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  product_id   INTEGER REFERENCES products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL DEFAULT '',
  sku          TEXT NOT NULL DEFAULT '',
  url          TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS qr_records_merchant_idx ON qr_records (merchant_id, created_at DESC);
`;

async function main() {
  if (!env('DATABASE_URL')) {
    console.error('DATABASE_URL is not set. Fill in .env.local first.');
    process.exit(1);
  }
  console.log('Connecting to Postgres …');
  await query(SQL);
  const tables = await query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema='public' AND table_name IN ('merchants','products','qr_records')
     ORDER BY table_name`
  );
  console.log('Ready. Tables:', tables.rows.map((r) => r.table_name).join(', '));
  await pool.end();
}

main().catch((e) => {
  console.error('Migration failed:', e.message);
  process.exit(1);
});
