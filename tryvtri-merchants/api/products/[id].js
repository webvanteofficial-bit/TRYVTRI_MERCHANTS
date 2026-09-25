import { query } from '../../lib/db.js';
import { requireAuth } from '../../lib/auth.js';
import { handler, ApiError, body } from '../../lib/http.js';

async function owned(id, merchantId) {
  const r = await query('SELECT * FROM products WHERE id = $1 AND merchant_id = $2', [id, merchantId]);
  if (!r.rows.length) throw new ApiError(404, 'Product not found');
  return r.rows[0];
}

function normalizeUrl(url) {
  let u = String(url || '').trim();
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
  try {
    const parsed = new URL(u);
    if (!parsed.hostname.includes('.')) throw new Error('bad host');
    return parsed.toString();
  } catch {
    throw new ApiError(400, 'Enter a valid product URL');
  }
}

export default handler(async (req, res) => {
  const merchant = requireAuth(req);
  const id = Number(req.query.id);
  if (!Number.isInteger(id)) throw new ApiError(400, 'Bad product id');

  if (req.method === 'DELETE') {
    await owned(id, merchant.id);
    await query('DELETE FROM products WHERE id = $1', [id]);
    return res.status(200).json({ ok: true });
  }

  if (req.method === 'PATCH') {
    const p = await owned(id, merchant.id);
    const b = body(req);
    const name = b.name !== undefined ? String(b.name).trim() || p.name : p.name;
    const sku = b.sku !== undefined ? String(b.sku).trim() : p.sku;
    const image = b.image !== undefined ? String(b.image).trim() : p.image;
    const url = b.url !== undefined && String(b.url).trim() !== p.url ? normalizeUrl(b.url) : p.url;
    const r = await query(
      `UPDATE products SET name = $1, sku = $2, url = $3, image = $4
       WHERE id = $5 AND merchant_id = $6 RETURNING *`,
      [name, sku, url, image, id, merchant.id]
    );
    return res.status(200).json(r.rows[0]);
  }

  if (req.method === 'GET') {
    return res.status(200).json(await owned(id, merchant.id));
  }

  throw new ApiError(405, 'Method not allowed');
});
