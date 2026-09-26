import { db } from '../lib/supabase.js';
import { requireAuth } from '../lib/auth.js';
import { handler, ApiError, body } from '../lib/http.js';
import { buildQrCardPng, slug, CARD_W, CARD_H } from '../lib/qrcard.js';

export default handler(async (req, res) => {
  if (req.method !== 'POST') throw new ApiError(405, 'Method not allowed');
  const merchant = requireAuth(req);

  const productId = Number(body(req).product_id);
  if (!Number.isInteger(productId)) throw new ApiError(400, 'product_id is required');

  const pr = await db()
    .from('products')
    .select('*')
    .eq('id', productId)
    .eq('merchant_id', merchant.id)
    .limit(1);
  if (pr.error) throw new ApiError(500, 'Could not load that product');
  if (!pr.data.length) throw new ApiError(404, 'Product not found');
  const p = pr.data[0];

  const buf = await buildQrCardPng(p.url, p.name, p.sku);
  const png = buf.toString('base64');
  const filename = `${slug(p.sku || p.name)}-qr.png`;

  const upd = await db().from('products').update({ qr_generated: true }).eq('id', p.id);
  if (upd.error) throw new ApiError(500, 'Could not update the product');

  const rec = await db()
    .from('qr_records')
    .insert({
      merchant_id: merchant.id,
      product_id: p.id,
      product_name: p.name,
      sku: p.sku,
      url: p.url,
    })
    .select('id, created_at')
    .single();
  if (rec.error) throw new ApiError(500, 'Could not record that download');

  const count = await db()
    .from('qr_records')
    .select('id', { count: 'exact', head: true })
    .eq('product_id', p.id);

  res.status(200).json({
    png,
    mime: 'image/png',
    width: CARD_W,
    height: CARD_H,
    filename,
    record_id: rec.data.id,
    created_at: rec.data.created_at,
    qr_count: count.count ?? 0,
    product: { ...p, qr_generated: true },
  });
});
