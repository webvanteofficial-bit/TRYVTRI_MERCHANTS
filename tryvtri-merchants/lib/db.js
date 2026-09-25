import pg from 'pg';
import { env } from './env.js';

function parseConnectionString(cs) {
  const m = /^postgres(?:ql)?:\/\/([^:/?@]+):([^@]*)@(?:\[?([^\]:/]+)\]?):(\d+)\/([^?]+)/.exec(cs || '');
  if (!m) return { connectionString: cs };
  let password = m[2];
  if (password.startsWith('[') && password.endsWith(']')) password = password.slice(1, -1);
  return {
    user: decodeURIComponent(m[1]),
    password: decodeURIComponent(password),
    host: m[3],
    port: Number(m[4]),
    database: decodeURIComponent(m[5]),
  };
}

const url = env('DATABASE_URL', '');
if (!url) {
  console.error('[db] DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.');
}

const cfg = {
  ...parseConnectionString(url),
  max: 5,
  connectionTimeoutMillis: 15000,
  idleTimeoutMillis: 30000,
};
if (/supabase|sslmode=require/i.test(url)) cfg.ssl = { rejectUnauthorized: false };

export const pool = new pg.Pool(cfg);
pool.on('error', (e) => console.error('[db] idle client error:', e.message));

export function query(text, params) {
  return pool.query(text, params);
}
