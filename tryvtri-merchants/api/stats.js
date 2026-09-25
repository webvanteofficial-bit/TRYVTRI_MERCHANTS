import { query } from '../lib/db.js';
import { requireAuth } from '../lib/auth.js';
import { handler } from '../lib/http.js';

export default handler(async (req, res) => {
  if (req.method !== 'GET') throw new Error('Method not allowed');
  const merchant = requireAuth(req);
  const id = merchant.id;

  const [total, generated, records, recentRecords, recentProducts, perProduct] = await Promise.all([
    query('SELECT count(*)::int AS n FROM products WHERE merchant_id = $1', [id]),
    query('SELECT count(*)::int AS n FROM products WHERE merchant_id = $1 AND qr_generated = true', [id]),
    query('SELECT count(*)::int AS n FROM qr_records WHERE merchant_id = $1', [id]),
    query(
      `SELECT id, product_id, product_name, sku, url, created_at
       FROM qr_records WHERE merchant_id = $1 ORDER BY id DESC LIMIT 8`,
      [id]
    ),
    query(
      `SELECT id, name, sku, image, url, qr_generated, created_at,
              (SELECT count(*)::int FROM qr_records r WHERE r.product_id = products.id) AS qr_count
       FROM products WHERE merchant_id = $1 ORDER BY id DESC LIMIT 6`,
      [id]
    ),
    query(
      `SELECT p.id, p.name, p.sku, count(r.id)::int AS qr_count
       FROM products p
       LEFT JOIN qr_records r ON r.product_id = p.id
       WHERE p.merchant_id = $1
       GROUP BY p.id
       ORDER BY qr_count DESC, p.id DESC
       LIMIT 8`,
      [id]
    ),
  ]);

  res.status(200).json({
    products: total.rows[0].n,
    qr_generated: generated.rows[0].n,
    qr_records: records.rows[0].n,
    recent_records: recentRecords.rows,
    recent_products: recentProducts.rows,
    per_product: perProduct.rows,
    merchant: { id: merchant.id, name: merchant.name, email: merchant.email || '' },
  });
});
