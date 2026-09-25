import { query } from '../../lib/db.js';
import { requireAuth } from '../../lib/auth.js';
import { handler, ApiError, body } from '../../lib/http.js';

function nameFromUrl(url) {
  try {
    const u = new URL(url);
    const seg = u.pathname.split('/').filter(Boolean).pop() || u.hostname;
    const words = seg
      .replace(/\.[a-z0-9]+$/i, '')
      .replace(/[-_]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return words ? words.replace(/\b\w/g, (c) => c.toUpperCase()) : u.hostname;
  } catch {
    return '';
  }
}

const WITH_COUNT = `
  SELECT p.*, COALESCE(c.n, 0)::int AS qr_count
  FROM products p
  LEFT JOIN (
    SELECT product_id, count(*)::int AS n
    FROM qr_records
    WHERE merchant_id = $1 AND product_id IS NOT NULL
    GROUP BY product_id
  ) c ON c.product_id = p.id
`;

export default handler(async (req, res) => {
  const merchant = requireAuth(req);

  if (req.method === 'GET') {
    const q = String(req.query.q || '').trim();
    let rows;
    if (q) {
      const like = '%' + q.replace(/[\\%_]/g, (c) => '\\' + c) + '%';
      const r = await query(
        `${WITH_COUNT}
         WHERE p.merchant_id = $1 AND (p.name ILIKE $2 OR p.sku ILIKE $2 OR p.url ILIKE $2)
         ORDER BY p.id DESC LIMIT 300`,
        [merchant.id, like]
      );
      rows = r.rows;
    } else {
      const r = await query(`${WITH_COUNT} WHERE p.merchant_id = $1 ORDER BY p.id DESC LIMIT 300`, [
        merchant.id,
      ]);
      rows = r.rows;
    }
    return res.status(200).json(rows);
  }

  if (req.method === 'POST') {
    const b = body(req);
    let url = String(b.url || '').trim();
    if (!url) throw new ApiError(400, 'Product URL is required');
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    try {
      const u = new URL(url);
      if (!u.hostname.includes('.')) throw new Error('bad host');
      url = u.toString();
    } catch {
      throw new ApiError(400, 'Enter a valid product URL');
    }

    const sku = String(b.sku || '').trim();
    const image = String(b.image || '').trim();
    const name = String(b.name || '').trim() || nameFromUrl(url);

    try {
      const r = await query(
        `INSERT INTO products (merchant_id, name, url, sku, image)
         VALUES ($1, $2, $3, $4, $5) RETURNING *, 0 AS qr_count`,
        [merchant.id, name, url, sku, image]
      );
      return res.status(201).json(r.rows[0]);
    } catch (e) {
      if (e.code === '23505') throw new ApiError(409, 'This product URL is already in your catalog');
      throw e;
    }
  }

  throw new ApiError(405, 'Method not allowed');
});
