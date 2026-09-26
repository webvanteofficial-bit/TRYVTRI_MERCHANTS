import { createClient } from '@supabase/supabase-js';
import { env } from './env.js';
import { ApiError } from './http.js';

const DEFAULT_URL = 'https://accjchbkfcgwngwjfbhn.supabase.co';

const KEY_NAMES = [
  'SUPABASE_SECRET_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_SERVICE_KEY',
  'SUPABASE_KEY',
  'SB_SECRET_KEY',
];

let client;

function readKey() {
  for (const name of KEY_NAMES) {
    const v = env(name, '');
    if (v) return v;
  }
  return '';
}

function restUrl() {
  const raw = String(env('SUPABASE_URL', '') || env('DATABASE_URL', '')).trim();
  if (!raw) return DEFAULT_URL;
  if (/^https?:\/\//i.test(raw) && !raw.includes('@')) return raw.replace(/\/+$/, '');
  const m = /(?:db\.)?([a-z0-9]{12,})\.supabase\.(?:co|com)/i.exec(raw) || /postgres\.([a-z0-9]{12,})@/i.exec(raw);
  if (m) return 'https://' + m[1] + '.supabase.co';
  return /^https?:\/\//i.test(raw) ? raw : DEFAULT_URL;
}

export function db() {
  if (!client) {
    const url = restUrl();
    const key = readKey();
    if (!key) {
      throw new ApiError(
        500,
        'Server is missing SUPABASE_SECRET_KEY. In Vercel: Settings > Environment Variables > add SUPABASE_SECRET_KEY (sb_secret_...), then Redeploy.'
      );
    }
    client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}

export function likeEscape(s) {
  return String(s).replace(/[\\%_]/g, (c) => '\\' + c);
}

export function searchEscape(s) {
  return String(s)
    .replace(/[,'()\\]/g, ' ')
    .trim()
    .slice(0, 120);
}
