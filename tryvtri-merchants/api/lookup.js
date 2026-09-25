import dns from 'node:dns/promises';
import net from 'node:net';
import { handler, ApiError, body } from '../lib/http.js';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const TIMEOUT = 9000;
const MAX_HTML = 2_500_000;

/* ---------------------------------------------------------------- security */

function ipv4Blocked(ip) {
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = p;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 192 && b === 0) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  if (a >= 224) return true;
  return false;
}

function ipBlocked(ip) {
  if (net.isIPv4(ip)) return ipv4Blocked(ip);
  const v6 = ip.toLowerCase().replace(/^\[|\]$/g, '');
  if (v6 === '::' || v6 === '::1') return true;
  if (v6.startsWith('fe8') || v6.startsWith('fe9') || v6.startsWith('fea') || v6.startsWith('feb')) return true;
  if (v6.startsWith('fc') || v6.startsWith('fd')) return true;
  if (v6.startsWith('ff')) return true;
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v6);
  if (mapped) return ipv4Blocked(mapped[1]);
  const v4mapped = /^::(\d+\.\d+\.\d+\.\d+)$/.exec(v6);
  if (v4mapped) return ipv4Blocked(v4mapped[1]);
  return false;
}

async function assertPublicHost(hostname) {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    throw new ApiError(400, 'That address cannot be used');
  }
  if (net.isIP(host)) {
    if (ipBlocked(host)) throw new ApiError(400, 'That address cannot be used');
    return;
  }
  let addrs = [];
  try {
    addrs = await dns.lookup(host, { all: true, verbatim: false });
  } catch {
    throw new ApiError(400, 'Could not find that store address');
  }
  if (!addrs.length) throw new ApiError(400, 'Could not find that store address');
  if (addrs.some((a) => ipBlocked(a.address))) throw new ApiError(400, 'That address cannot be used');
}

/* ------------------------------------------------------------------ fetch */

async function grab(url, type) {
  const res = await fetch(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(TIMEOUT),
    headers: {
      'User-Agent': UA,
      Accept: type === 'json' ? 'application/json,text/plain,*/*' : 'text/html,application/xhtml+xml,*/*',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });
  if (!res.ok) return null;
  const buf = await res.arrayBuffer();
  const text = Buffer.from(buf).toString('utf8').slice(0, MAX_HTML);
  return { text, finalUrl: res.url };
}

/* ---------------------------------------------------------------- parsing */

function decode(s) {
  return String(s || '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, ' ')
    .trim();
}

function metas(html) {
  const out = {};
  const re = /<meta\b[^>]*>/gi;
  let m;
  while ((m = re.exec(html))) {
    const tag = m[0];
    const key = (/(?:property|name|itemprop)=["']([^"']+)["']/i.exec(tag) || [])[1];
    const val = (/(?:content)=["']([^"']*)["']/i.exec(tag) || [])[1];
    if (key && val !== undefined && out[key] === undefined) out[key] = decode(val);
  }
  return out;
}

function jsonldProducts(html) {
  const found = [];
  const re = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    let data;
    try {
      data = JSON.parse(m[1].trim());
    } catch {
      continue;
    }
    const stack = Array.isArray(data) ? [...data] : [data];
    while (stack.length) {
      const node = stack.shift();
      if (!node || typeof node !== 'object') continue;
      if (Array.isArray(node)) {
        stack.push(...node);
        continue;
      }
      if (node['@graph']) stack.push(...[].concat(node['@graph']));
      const t = node['@type'];
      const types = Array.isArray(t) ? t : t ? [t] : [];
      if (types.some((x) => /product/i.test(String(x))) && (node.name || node.offers)) found.push(node);
      else if (node.name && (node.sku || node.gtin || node.mpn || node.offers)) found.push(node);
    }
  }
  return found;
}

function firstImage(img) {
  if (!img) return '';
  if (typeof img === 'string') return img;
  if (Array.isArray(img)) return firstImage(img[0]);
  if (typeof img === 'object') return img.url || img.contentUrl || img['@id'] || '';
  return '';
}

function fromJsonld(node) {
  const offers = Array.isArray(node.offers) ? node.offers[0] : node.offers;
  const brand = node.brand && typeof node.brand === 'object' ? node.brand.name : node.brand;
  return {
    name: decode(node.name || ''),
    sku: decode(node.sku || node.gtin13 || node.gtin || node.mpn || ''),
    image: firstImage(node.image || node.thumbnailUrl),
    description: decode(node.description || ''),
    price: offers && offers.price !== undefined ? String(offers.price) : '',
    currency: offers && offers.priceCurrency ? String(offers.priceCurrency) : '',
    brand: decode(brand || ''),
  };
}

function stripStore(title, site) {
  let t = decode(title);
  if (!site) return t;
  for (const sep of [' \u2013 ', ' \u2014 ', ' | ', ' - ']) {
    const i = t.lastIndexOf(sep + site);
    if (i > 0) return t.slice(0, i).trim();
  }
  return t;
}

function slugTitle(url) {
  try {
    const u = new URL(url);
    const seg = u.pathname.split('/').filter(Boolean).pop() || '';
    const words = seg
      .replace(/\.[a-z0-9]+$/i, '')
      .replace(/[-_]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return words ? words.replace(/\b\w/g, (c) => c.toUpperCase()) : u.hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/* --------------------------------------------------------------- handler */

export default handler(async (req, res) => {
  if (req.method !== 'POST') throw new ApiError(405, 'Method not allowed');

  let url = String(body(req).url || '').trim();
  if (!url) throw new ApiError(400, 'Paste a product URL first');
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;

  let u;
  try {
    u = new URL(url);
    if (!u.hostname.includes('.')) throw new Error('bad host');
  } catch {
    throw new ApiError(400, 'Enter a valid product URL');
  }

  await assertPublicHost(u.hostname);

  const handle = /\/products\/([^/?#]+)/i.exec(u.pathname);
  const jsUrl = handle ? u.origin + '/products/' + handle[1] + '.js' : '';

  const [page, shop] = await Promise.all([
    grab(u.toString(), 'html').catch(() => null),
    jsUrl ? grab(jsUrl, 'json').catch(() => null) : Promise.resolve(null),
  ]);

  if (!page && !shop) throw new ApiError(422, 'Could not open that page. Check the URL and try again.');

  const html = page ? page.text : '';
  const meta = metas(html);
  const ld = html ? jsonldProducts(html) : [];
  const fromLd = ld.length ? fromJsonld(ld[0]) : null;

  let shopJson = null;
  if (shop) {
    try {
      const j = JSON.parse(shop.text);
      if (j && typeof j === 'object' && j.title) {
        const v = (j.variants || []).find((x) => x && x.sku) || (j.variants || [])[0] || {};
        shopJson = {
          name: j.title,
          sku: v.sku || '',
          image: j.featured_image || firstImage(j.image) || v.featured_image || '',
          price: j.price !== undefined ? String(Number(j.price) / 100) : '',
          currency: j.currency || meta['og:currency'] || '',
          description: decode(j.description || ''),
          brand: '',
        };
      }
    } catch {
      shopJson = null;
    }
  }

  const site = meta['og:site_name'] || '';
  const titleTag = html ? (/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html) || [])[1] : '';
  const metaTitle = meta['og:title'] || meta['twitter:title'] || '';

  const name =
    (fromLd && fromLd.name) ||
    (shopJson && shopJson.name) ||
    stripStore(metaTitle, site) ||
    stripStore(titleTag, site) ||
    slugTitle(u.toString());

  let sku =
    (fromLd && fromLd.sku) ||
    (shopJson && shopJson.sku) ||
    meta['product:sku:0'] ||
    meta['product:sku'] ||
    meta['og:product:sku'] ||
    '';

  if (!sku && html) {
    const m = /"sku"\s*:\s*"([^"]{1,80})"/.exec(html);
    if (m && m[1]) sku = m[1];
  }
  if (sku === 'null' || sku === 'undefined') sku = '';

  const image =
    (fromLd && fromLd.image) ||
    (shopJson && shopJson.image) ||
    meta['og:image'] ||
    meta['twitter:image'] ||
    '';

  const price =
    (fromLd && fromLd.price) ||
    (shopJson && shopJson.price) ||
    meta['product:price:amount'] ||
    meta['og:price:amount'] ||
    '';

  const description =
    (fromLd && fromLd.description) ||
    (shopJson && shopJson.description) ||
    meta['og:description'] ||
    meta['description'] ||
    '';

  res.status(200).json({
    url: u.toString(),
    store: site || u.hostname.replace(/^www\./, ''),
    name: name.slice(0, 200),
    sku: String(sku).slice(0, 80),
    sku_found: !!String(sku).trim(),
    image: String(image).slice(0, 600),
    description: String(description).slice(0, 300),
    price: String(price || '').slice(0, 24),
    currency: String((fromLd && fromLd.currency) || (shopJson && shopJson.currency) || '').slice(0, 8),
    platform: /shopify/i.test(html) || !!shopJson ? 'Shopify' : 'Store',
  });
});
