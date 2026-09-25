import { query } from '../lib/db.js';
import { requireAuth } from '../lib/auth.js';
import { handler, ApiError, body } from '../lib/http.js';
import { buildQrCardPng, slug, CARD_W, CARD_H } from '../lib/qrcard.js';

export default handler(async (req, res) => {
  if (req.method !== 'POST') throw new ApiError(405, 'Method not allowed');
  const merchant = requireAuth(req);

  const productId = Number(body(req).product_id);
  if (!Number.isInteger(productId)) throw new ApiError(400, 'product_id is required');

  const pr = await query('SELECT * FROM products WHERE id = $1 AND merchant_id = $2', [productId, merchant.id]);
  if (!pr.rows.length) throw new ApiError(404, 'Product not found');
  const p = pr.rows[0];

  const buf = await buildQrCardPng(p.url, p.name, p.sku);
  const png = buf.toString('base64');
  const filename = `${slug(p.sku || p.name)}-qr.png`;

  await query('UPDATE products SET qr_generated = true WHERE id = $1', [p.id]);
  const rec = await query(
    `INSERT INTO qr_records (merchant_id, product_id, product_name, sku, url)
     VALUES ($1, $2, $3, $4, $5) RETURNING id, created_at`,
    [merchant.id, p.id, p.name, p.sku, p.url]
  );
  const count = await query('SELECT count(*)::int AS n FROM qr_records WHERE product_id = $1', [p.id]);

  res.status(200).json({
    png,
    mime: 'image/png',
    width: CARD_W,
    height: CARD_H,
    filename,
    record_id: rec.rows[0].id,
    created_at: rec.rows[0].created_at,
    qr_count: count.rows[0].n,
    product: p,
  });
});
