import { db } from '../../lib/supabase.js';
import { requireAuth } from '../../lib/auth.js';
import { handler, ApiError, body } from '../../lib/http.js';

async function owned(id, merchantId) {
  const r = await db()
    .from('products')
    .select('*')
    .eq('id', id)
    .eq('merchant_id', merchantId)
    .limit(1);
  if (r.error) throw new ApiError(500, 'Could not load that product');
  if (!r.data.length) throw new ApiError(404, 'Product not found');
  return r.data[0];
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
    const r = await db().from('products').delete().eq('id', id).eq('merchant_id', merchant.id);
    if (r.error) throw new ApiError(500, 'Could not delete that product');
    return res.status(200).json({ ok: true });
  }

  if (req.method === 'PATCH') {
    const p = await owned(id, merchant.id);
    const b = body(req);
    const name = b.name !== undefined ? String(b.name).trim() || p.name : p.name;
    const sku = b.sku !== undefined ? String(b.sku).trim() : p.sku;
    const image = b.image !== undefined ? String(b.image).trim() : p.image;
    const url = b.url !== undefined && String(b.url).trim() !== p.url ? normalizeUrl(b.url) : p.url;

    const r = await db()
      .from('products')
      .update({ name, sku, url, image })
      .eq('id', id)
      .eq('merchant_id', merchant.id)
      .select('*')
      .single();
    if (r.error) throw new ApiError(500, 'Could not update that product');
    return res.status(200).json(r.data);
  }

  if (req.method === 'GET') {
    return res.status(200).json(await owned(id, merchant.id));
  }

  throw new ApiError(405, 'Method not allowed');
});
