import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createHash } from 'node:crypto';
import { env } from './env.js';
import { ApiError } from './http.js';

const KEY = env('SUPABASE_SECRET_KEY', env('SUPABASE_SERVICE_ROLE_KEY', ''));
const SECRET =
  env('JWT_SECRET', '') ||
  (KEY ? createHash('sha256').update('tryvtri-jwt:' + KEY).digest('hex') : 'tryvtri-dev-secret-change-me');

export const hashPassword = (pw) => bcrypt.hashSync(pw, 10);
export const checkPassword = (pw, hash) => bcrypt.compareSync(pw, hash);

export const createToken = (merchant) =>
  jwt.sign({ uid: merchant.id, name: merchant.name, email: merchant.email || '' }, SECRET, {
    expiresIn: '7d',
  });

function bearer(req) {
  const h = req.headers.authorization || req.headers.Authorization || '';
  if (typeof h !== 'string') return null;
  if (h.startsWith('Bearer ')) return h.slice(7).trim();
  return h.trim() || null;
}

export function requireAuth(req) {
  const t = bearer(req);
  if (!t) throw new ApiError(401, 'Not authenticated');
  try {
    const p = jwt.verify(t, SECRET);
    if (!p.uid) throw new Error('bad payload');
    return { id: Number(p.uid), name: String(p.name || ''), email: String(p.email || '') };
  } catch {
    throw new ApiError(401, 'Session expired. Please login again.');
  }
}
