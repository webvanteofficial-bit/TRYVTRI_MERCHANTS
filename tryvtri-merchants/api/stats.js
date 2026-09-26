import { db } from '../lib/supabase.js';
import { requireAuth } from '../lib/auth.js';
import { handler, ApiError } from '../lib/http.js';

export default handler(async (req, res) => {
  if (req.method !== 'GET') throw new ApiError(405, 'Method not allowed');
  const merchant = requireAuth(req);
  const id = merchant.id;

  const products = db().from('products');
  const records = db().from('qr_records');

  const [total, generated, recordCount, recentRecords, recentProducts, allProducts] = await Promise.all([
    products.select('id', { count: 'exact', head: true }).eq('merchant_id', id),
    products.select('id', { count: 'exact', head: true }).eq('merchant_id', id).eq('qr_generated', true),
    records.select('id', { count: 'exact', head: true }).eq('merchant_id', id),
    records
      .select('id, product_id, product_name, sku, url, created_at')
      .eq('merchant_id', id)
      .order('id', { ascending: false })
      .limit(8),
    products
      .select('id, name, sku, image, url, qr_generated, created_at, qr_records(count)')
      .eq('merchant_id', id)
      .order('id', { ascending: false })
      .limit(6),
    products
      .select('id, name, sku, qr_records(count)')
      .eq('merchant_id', id)
      .order('id', { ascending: false })
      .limit(300),
  ]);

  const failed = [total, generated, recordCount, recentRecords, recentProducts, allProducts].find((r) => r.error);
  if (failed) throw new ApiError(500, 'Could not load your dashboard');

  const countOf = (p) => (p.qr_records && p.qr_records[0] ? p.qr_records[0].count : 0);

  const recentProductsRows = recentProducts.data.map((p) => {
    const { qr_records, ...rest } = p;
    return { ...rest, qr_count: countOf(p) };
  });

  const perProduct = allProducts.data
    .map((p) => ({ id: p.id, name: p.name, sku: p.sku, qr_count: countOf(p) }))
    .sort((a, b) => b.qr_count - a.qr_count || b.id - a.id)
    .slice(0, 8);

  res.status(200).json({
    products: total.count ?? 0,
    qr_generated: generated.count ?? 0,
    qr_records: recordCount.count ?? 0,
    recent_records: recentRecords.data,
    recent_products: recentProductsRows,
    per_product: perProduct,
    merchant: { id: merchant.id, name: merchant.name, email: merchant.email || '' },
  });
});
