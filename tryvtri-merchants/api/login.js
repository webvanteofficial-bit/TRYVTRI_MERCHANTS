import { query } from '../lib/db.js';
import { checkPassword, createToken } from '../lib/auth.js';
import { handler, ApiError, body } from '../lib/http.js';

export default handler(async (req, res) => {
  if (req.method !== 'POST') throw new ApiError(405, 'Method not allowed');
  const b = body(req);
  const name = String(b.name || '').trim();
  const password = String(b.password || '');

  if (!name || !password) throw new ApiError(400, 'Enter your username and password');

  const r = await query('SELECT id, name, email, password_hash FROM merchants WHERE lower(name) = lower($1)', [name]);
  if (!r.rows.length) throw new ApiError(401, 'Invalid username or password');
  const m = r.rows[0];
  if (!checkPassword(password, m.password_hash)) throw new ApiError(401, 'Invalid username or password');

  res.status(200).json({ token: createToken(m), id: m.id, name: m.name, email: m.email });
});
