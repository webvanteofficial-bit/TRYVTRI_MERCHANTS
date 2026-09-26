import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function parseFile(file) {
  const out = {};
  try {
    if (!fs.existsSync(file)) return out;
    for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const i = line.indexOf('=');
      if (i < 1) continue;
      out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    }
  } catch {
    /* ignore */
  }
  return out;
}

const env = {
  ...parseFile(path.join(ROOT, '.env')),
  ...parseFile(path.join(ROOT, '.env.local')),
};
const url = process.env.DATABASE_URL || env.DATABASE_URL || '';
if (!url) {
  console.error('DATABASE_URL is not set. Fill in .env.local first.');
  process.exit(1);
}

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

GRANT USAGE ON SCHEMA public TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO service_role;
`;

async function main() {
  const cfg = { connectionString: url, max: 2, connectionTimeoutMillis: 15000 };
  if (/supabase|sslmode=require/i.test(url)) cfg.ssl = { rejectUnauthorized: false };
  const client = new pg.Client(cfg);
  await client.connect();
  console.log('Applying schema ...');
  await client.query(SQL);
  const tables = await client.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema='public' AND table_name IN ('merchants','products','qr_records')
     ORDER BY table_name`
  );
  console.log('Ready. Tables:', tables.rows.map((r) => r.table_name).join(', '));
  await client.end();
}

main().catch((e) => {
  console.error('Migration failed:', e.message);
  process.exit(1);
});
