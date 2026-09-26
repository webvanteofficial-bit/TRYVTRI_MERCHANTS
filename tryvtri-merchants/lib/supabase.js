import { createClient } from '@supabase/supabase-js';
import { env } from './env.js';
import { ApiError } from './http.js';

const DEFAULT_URL = 'https://accjchbkfcgwngwjfbhn.supabase.co';

let client;

export function db() {
  if (!client) {
    const url = env('SUPABASE_URL', DEFAULT_URL);
    const key = env('SUPABASE_SECRET_KEY', '');
    if (!url || !key) {
      throw new ApiError(500, 'Server is missing SUPABASE_URL / SUPABASE_SECRET_KEY');
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
