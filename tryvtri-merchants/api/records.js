import { db } from '../lib/supabase.js';
import { requireAuth } from '../lib/auth.js';
import { handler, ApiError } from '../lib/http.js';

export default handler(async (req, res) => {
  if (req.method !== 'GET') throw new ApiError(405, 'Method not allowed');
  const merchant = requireAuth(req);

  const r = await db()
    .from('qr_records')
    .select('id, product_id, product_name, sku, url, created_at, products(id, qr_generated)')
    .eq('merchant_id', merchant.id)
    .order('id', { ascending: false })
    .limit(200);

  if (r.error) throw new ApiError(500, 'Could not load your QR records');

  const rows = r.data.map((row) => {
    const { products, ...rest } = row;
    return {
      ...rest,
      product_exists: !!products,
      qr_generated: products ? products.qr_generated : null,
    };
  });

  res.status(200).json(rows);
});
