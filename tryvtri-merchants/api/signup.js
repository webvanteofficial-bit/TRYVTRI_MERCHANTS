import { db, likeEscape } from '../lib/supabase.js';
import { hashPassword, createToken } from '../lib/auth.js';
import { handler, ApiError, body } from '../lib/http.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export default handler(async (req, res) => {
  if (req.method !== 'POST') throw new ApiError(405, 'Method not allowed');
  const b = body(req);
  const name = String(b.name || '').trim().replace(/\s+/g, ' ');
  const email = String(b.email || '').trim().toLowerCase();
  const password = String(b.password || '');

  if (name.length < 2) throw new ApiError(400, 'Enter a username (at least 2 characters)');
  if (name.length > 60) throw new ApiError(400, 'Username must be 60 characters or less');
  if (!EMAIL_RE.test(email)) throw new ApiError(400, 'Enter a valid email address');
  if (email.length > 255) throw new ApiError(400, 'Email must be 255 characters or less');
  if (password.length < 6) throw new ApiError(400, 'Password must be at least 6 characters');

  const exists = await db()
    .from('merchants')
    .select('id')
    .ilike('name', likeEscape(name))
    .limit(1);
  if (exists.error) throw new ApiError(500, 'Could not reach the database');
  if (exists.data.length) throw new ApiError(409, 'That username is already taken. Please sign in instead.');

  const mail = await db()
    .from('merchants')
    .select('id')
    .ilike('email', likeEscape(email))
    .limit(1);
  if (mail.error) throw new ApiError(500, 'Could not reach the database');
  if (mail.data.length) throw new ApiError(409, 'That email is already registered. Please sign in instead.');

  const r = await db()
    .from('merchants')
    .insert({ name, email, password_hash: hashPassword(password) })
    .select('id, name, email')
    .single();

  if (r.error) {
    if (r.error.code === '23505') {
      throw new ApiError(409, 'That username or email is already registered. Please sign in instead.');
    }
    throw new ApiError(500, 'Could not create your account');
  }

  res.status(201).json({ token: createToken(r.data), id: r.data.id, name: r.data.name, email: r.data.email });
});
