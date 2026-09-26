import { db, searchEscape } from '../../lib/supabase.js';
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

export default handler(async (req, res) => {
  const merchant = requireAuth(req);

  if (req.method === 'GET') {
    const q = searchEscape(String(req.query.q || '').trim());
    let qry = db()
      .from('products')
      .select('id, merchant_id, name, url, sku, image, qr_generated, created_at, qr_records(count)')
      .eq('merchant_id', merchant.id);

    if (q) {
      const like = '%' + q + '%';
      qry = qry.or(`name.ilike.${like},sku.ilike.${like},url.ilike.${like}`);
    }

    const r = await qry.order('id', { ascending: false }).limit(300);
    if (r.error) throw new ApiError(500, 'Could not load your products');

    const rows = r.data.map((p) => {
      const { qr_records, ...rest } = p;
      return { ...rest, qr_count: qr_records && qr_records[0] ? qr_records[0].count : 0 };
    });
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

    const r = await db()
      .from('products')
      .insert({ merchant_id: merchant.id, name, url, sku, image })
      .select('id, merchant_id, name, url, sku, image, qr_generated, created_at')
      .single();

    if (r.error) {
      if (r.error.code === '23505') {
        throw new ApiError(409, 'This product URL is already in your catalog');
      }
      throw new ApiError(500, 'Could not save that product');
    }
    return res.status(201).json({ ...r.data, qr_count: 0 });
  }

  throw new ApiError(405, 'Method not allowed');
});
