import { query } from '../lib/db.js';
import { requireAuth } from '../lib/auth.js';
import { handler } from '../lib/http.js';

export default handler(async (req, res) => {
  if (req.method !== 'GET') throw new Error('Method not allowed');
  const merchant = requireAuth(req);
  const r = await query(
    `SELECT r.id, r.product_id, r.product_name, r.sku, r.url, r.created_at,
            (p.id IS NOT NULL) AS product_exists,
            p.qr_generated
     FROM qr_records r
     LEFT JOIN products p ON p.id = r.product_id
     WHERE r.merchant_id = $1
     ORDER BY r.id DESC
     LIMIT 200`,
    [merchant.id]
  );
  res.status(200).json(r.rows);
});
