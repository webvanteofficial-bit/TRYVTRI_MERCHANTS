import { requireAuth } from '../lib/auth.js';
import { handler } from '../lib/http.js';

export default handler(async (req, res) => {
  if (req.method !== 'GET') throw new Error('Method not allowed');
  const m = requireAuth(req);
  res.status(200).json({ id: m.id, name: m.name, email: m.email || '' });
});
