import { query } from '../lib/db.js';
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

  const exists = await query('SELECT 1 FROM merchants WHERE lower(name) = lower($1)', [name]);
  if (exists.rows.length) throw new ApiError(409, 'That username is already taken. Please sign in instead.');

  const mail = await query('SELECT 1 FROM merchants WHERE lower(email) = lower($1)', [email]);
  if (mail.rows.length) throw new ApiError(409, 'That email is already registered. Please sign in instead.');

  const r = await query(
    'INSERT INTO merchants (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id, name, email',
    [name, email, hashPassword(password)]
  );
  const m = r.rows[0];
  res.status(201).json({ token: createToken(m), id: m.id, name: m.name, email: m.email });
});
