import { db, likeEscape } from '../lib/supabase.js';
import { checkPassword, createToken } from '../lib/auth.js';
import { handler, ApiError, body } from '../lib/http.js';

export default handler(async (req, res) => {
  if (req.method !== 'POST') throw new ApiError(405, 'Method not allowed');
  const b = body(req);
  const name = String(b.name || '').trim();
  const password = String(b.password || '');

  if (!name || !password) throw new ApiError(400, 'Enter your username and password');

  const r = await db()
    .from('merchants')
    .select('id, name, email, password_hash')
    .ilike('name', likeEscape(name))
    .limit(1);

  if (r.error) throw new ApiError(500, 'Could not reach the database');
  if (!r.data.length) throw new ApiError(401, 'Invalid username or password');

  const m = r.data[0];
  if (!checkPassword(password, m.password_hash)) throw new ApiError(401, 'Invalid username or password');

  res.status(200).json({ token: createToken(m), id: m.id, name: m.name, email: m.email });
});
