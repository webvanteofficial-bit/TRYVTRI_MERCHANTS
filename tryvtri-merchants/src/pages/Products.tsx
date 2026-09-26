import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  api,
  downloadBase64,
  lookupProduct,
  qrDataUrl,
  type LookupResult,
  type Product,
  type QrResponse,
} from '../lib/api';
import { toast } from '../lib/toast';

function Spinner() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="spin">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity=".25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function ProductCard({
  p,
  gen,
  flash,
  onUpdated,
  onDeleted,
  onGenerate,
}: {
  p: Product;
  gen: boolean;
  flash: boolean;
  onUpdated: (p: Product) => void;
  onDeleted: (id: number) => void;
  onGenerate: (p: Product) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [sku, setSku] = useState(p.sku);
  const [busy, setBusy] = useState(false);
  const [imgBad, setImgBad] = useState(false);

  useEffect(() => setImgBad(false), [p.image]);

  async function saveSku() {
    setBusy(true);
    try {
      const up = await api<Product>('/products/' + p.id, { method: 'PATCH', body: { sku } });
      onUpdated({ ...up, qr_count: p.qr_count });
      setEditing(false);
      toast('SKU saved');
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm('Delete this product?')) return;
    try {
      await api('/products/' + p.id, { method: 'DELETE' });
      onDeleted(p.id);
      toast('Product deleted');
    } catch (e) {
      toast((e as Error).message, true);
    }
  }

  const count = p.qr_count || 0;

  return (
    <div className={'pcard' + (flash ? ' flash' : '')}>
      <div className="pcard-media">
        {p.image && !imgBad ? (
          <img loading="lazy" src={p.image} alt="" onError={() => setImgBad(true)} />
        ) : (
          <div className="ph">No image</div>
        )}
        <span className={'pcard-count' + (count ? '' : ' zero')}>
          {count ? count + (count === 1 ? ' QR' : ' QRs') : 'No QRs yet'}
        </span>
      </div>

      <div className="pcard-body">
        <div className="pcard-name" title={p.name}>
          {p.name || 'Untitled product'}
        </div>

        <a className="pcard-url" href={p.url} target="_blank" rel="noopener" title={p.url}>
          {p.url}
        </a>

        <div className="pcard-sku">
          {editing ? (
            <span className="pcard-sku-edit">
              <input
                type="text"
                value={sku}
                autoFocus
                onChange={(e) => setSku(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && saveSku()}
                placeholder="SKU"
              />
              <button className="btn dark sm" disabled={busy} onClick={saveSku}>
                {busy ? '…' : 'Save'}
              </button>
            </span>
          ) : p.sku ? (
            <>
              <span className="mut">SKU</span> <b>{p.sku}</b>
              <button className="lnk" style={{ marginLeft: 'auto' }} onClick={() => setEditing(true)}>
                Edit
              </button>
            </>
          ) : (
            <>
              <span className="miss">SKU missing</span>
              <button className="lnk" style={{ marginLeft: 'auto' }} onClick={() => setEditing(true)}>
                Add it
              </button>
            </>
          )}
        </div>

        <div className="pcard-actions">
          <button className="btn dark" disabled={gen} onClick={() => onGenerate(p)}>
            {gen ? <Spinner /> : null}
            {gen ? 'Generating…' : count ? 'Download QR' : 'Generate QR'}
          </button>
          <button className="btn d sm" onClick={remove} title="Delete product">
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Products() {
  const loc = useLocation();
  const [q, setQ] = useState(() => new URLSearchParams(loc.search).get('q') || '');
  const [items, setItems] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [genId, setGenId] = useState<number | null>(null);
  const [flashId, setFlashId] = useState<number | null>(null);
  const [preview, setPreview] = useState<{
    url: string;
    filename: string;
    png: string;
    width: number;
    height: number;
  } | null>(null);

  // lookup flow
  const [url, setUrl] = useState('');
  const [fetching, setFetching] = useState(false);
  const [found, setFound] = useState<LookupResult | null>(null);
  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [saveErr, setSaveErr] = useState('');
  const [saving, setSaving] = useState(false);
  const [lkImgBad, setLkImgBad] = useState(false);
  const urlRef = useRef<HTMLInputElement>(null);

  const backfilled = useRef<Set<number>>(new Set());

  const backfill = useCallback(async (rows: Product[]) => {
    const queue = rows.filter((p) => p.url && !p.image && !backfilled.current.has(p.id)).slice(0, 20);
    queue.forEach((p) => backfilled.current.add(p.id));
    if (!queue.length) return;
    await Promise.all(
      Array.from({ length: 3 }, async () => {
        while (queue.length) {
          const p = queue.shift();
          if (!p) break;
          try {
            const r = await lookupProduct(p.url);
            if (!r.image) continue;
            const up = await api<Product>('/products/' + p.id, {
              method: 'PATCH',
              body: { image: r.image },
            });
            setItems((old) =>
              old.map((x) => (x.id === p.id ? { ...x, image: up.image || r.image } : x))
            );
          } catch {}
        }
      })
    );
  }, []);

  const load = useCallback(async (query: string) => {
    try {
      const rows = await api<Product[]>('/products?q=' + encodeURIComponent(query));
      setItems(rows);
      backfill(rows);
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setLoading(false);
    }
  }, [backfill]);

  useEffect(() => {
    setQ(new URLSearchParams(loc.search).get('q') || '');
  }, [loc.search]);

  useEffect(() => {
    const t = setTimeout(() => load(q), 220);
    return () => clearTimeout(t);
  }, [q, load]);

  async function fetchProduct(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim() || fetching) return;
    setFetching(true);
    setSaveErr('');
    try {
      const r = await lookupProduct(url.trim());
      setFound(r);
      setLkImgBad(false);
      setName(r.name);
      setSku(r.sku);
      if (!r.sku_found) toast('SKU not found — enter it manually', true);
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setFetching(false);
    }
  }

  function resetLookup() {
    setFound(null);
    setUrl('');
    setName('');
    setSku('');
    setSaveErr('');
  }

  async function generate(p: Product) {
    if (genId) return;
    setGenId(p.id);
    try {
      const r = await api<QrResponse>('/qr', { method: 'POST', body: { product_id: p.id } });
      downloadBase64(r.png, r.filename, r.mime);
      setItems((old) =>
        old.map((x) => (x.id === p.id ? { ...x, qr_generated: true, qr_count: r.qr_count } : x))
      );
      setPreview({
        url: qrDataUrl(r.png),
        filename: r.filename,
        png: r.png,
        width: r.width,
        height: r.height,
      });
      toast('QR downloaded — ' + r.width + '×' + r.height + ' PNG');
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setGenId(null);
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!found || saving) return;
    if (!sku.trim()) {
      setSaveErr('SKU could not be found on that page — enter it manually to continue.');
      return;
    }
    setSaving(true);
    setSaveErr('');
    try {
      const p = await api<Product>('/products', {
        method: 'POST',
        body: { url: found.url, name: name.trim() || found.name, sku: sku.trim(), image: found.image },
      });
      setItems((old) => [p, ...old]);
      setFlashId(p.id);
      window.setTimeout(() => setFlashId(null), 1400);
      resetLookup();
      toast('Product saved');
      await generate(p);
    } catch (e) {
      setSaveErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const visible = items;
  const withQr = items.filter((p) => (p.qr_count || 0) > 0).length;
  const totalQr = items.reduce((n, p) => n + (p.qr_count || 0), 0);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>QR Studio</h1>
          <p className="sub">
            Paste a Shopify product URL — we identify the product and its image automatically, you
            confirm the SKU, then the QR code downloads instantly as a PNG.
          </p>
        </div>
      </div>

      {/* ---------------------------------------------------------- generate */}
      <section className="panel">
        <div className="panel-head">
          <div>
            <div className="eyebrow">
              Product QR <span className="pill">auto-detect</span>
            </div>
            <p className="panel-desc">
              Works with any Shopify product page. The product name, image and SKU are pulled
              straight from the store.
            </p>
          </div>
          <div className="panel-actions">
            <span className="badge">
              {items.length} product{items.length === 1 ? '' : 's'}
            </span>
            <span className={'badge' + (totalQr ? ' ok' : '')}>{totalQr} QR codes</span>
          </div>
        </div>

        <form onSubmit={fetchProduct} className="url-row">
          <input
            ref={urlRef}
            type="url"
            inputMode="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://yourstore.myshopify.com/products/product-handle"
            aria-label="Product URL"
          />
          <button className="btn dark" type="submit" disabled={fetching || !url.trim()}>
            {fetching ? <Spinner /> : null}
            {fetching ? 'Identifying…' : 'Fetch product'}
          </button>
        </form>

        {found && (
          <div className="lookup">
            <div className="lookup-thumb">
              {found.image && !lkImgBad ? (
                <img src={found.image} alt="" onError={() => setLkImgBad(true)} />
              ) : (
                'No image'
              )}
            </div>

            <div className="lookup-main">
              <div className="lookup-title">{found.name}</div>
              <div className="lookup-meta">
                <span className="badge ok">
                  <span className="dot ok" />
                  {found.platform} store
                </span>
                {found.store && <span className="badge">{found.store}</span>}
                {found.price && (
                  <span className="badge">
                    {found.currency ? found.currency + ' ' : ''}
                    {found.price}
                  </span>
                )}
                <span className={'badge' + (found.sku_found ? ' ok' : ' warn')}>
                  {found.sku_found ? 'SKU found' : 'SKU not found'}
                </span>
              </div>
            </div>

            {!found.sku_found && (
              <div className="lookup-note">
                We couldn't read a SKU from this page — enter it manually, then save.
              </div>
            )}

            <div className="lookup-form">
              <div className="grow">
                <label htmlFor="lk-name">Product name</label>
                <input id="lk-name" type="text" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="grow">
                <label htmlFor="lk-sku">SKU {!found.sku_found && <span style={{ color: 'var(--red)' }}>— required</span>}</label>
                <input
                  id="lk-sku"
                  type="text"
                  value={sku}
                  onChange={(e) => setSku(e.target.value)}
                  placeholder="e.g. PE2652-00S-SKY"
                />
              </div>
              <div className="row" style={{ marginTop: 0 }}>
                <button className="btn dark" onClick={save} disabled={saving}>
                  {saving ? 'Saving…' : 'Save & download QR'}
                </button>
                <button className="btn" type="button" onClick={resetLookup} disabled={saving}>
                  Cancel
                </button>
              </div>
            </div>

            {saveErr && <div className="form-err" style={{ gridColumn: '1 / -1' }}>{saveErr}</div>}
          </div>
        )}
      </section>

      {/* --------------------------------------------------- QR per product */}
      {items.length > 0 && (
        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>QR codes per product</h2>
              <p className="panel-desc">Every download is counted, so you always know what you have printed.</p>
            </div>
            <div className="panel-actions">
              <span className="badge">{withQr} of {items.length} have a QR</span>
            </div>
          </div>
          <div className="count-list" style={{ marginTop: 8 }}>
            {items.map((p) => {
              const n = p.qr_count || 0;
              return (
                <div className="count-row" key={p.id}>
                  <div className="who">
                    <b>{p.name || 'Untitled product'}</b>
                    <span>{p.sku ? 'SKU ' + p.sku : 'No SKU'}</span>
                  </div>
                  <span className={'count-n' + (n ? ' on' : '')}>{n}</span>
                  <button
                    className="btn sm"
                    disabled={genId === p.id}
                    onClick={() => generate(p)}
                  >
                    {genId === p.id ? '…' : 'Generate'}
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ------------------------------------------------------------ list */}
      <div className="bar">
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by name, SKU or URL"
        />
        <span className="meta">
          {loading ? 'Searching…' : visible.length + ' product' + (visible.length === 1 ? '' : 's')}
          {q ? ' matching “' + q + '”' : ''}
        </span>
      </div>

      {visible.length === 0 && !loading ? (
        <div className="empty">
          {q
            ? 'No products match your search.'
            : 'No products yet. Paste a product URL above and hit “Fetch product”.'}
        </div>
      ) : (
        <div className="grid">
          {visible.map((p) => (
            <ProductCard
              key={p.id}
              p={p}
              gen={genId === p.id}
              flash={flashId === p.id}
              onUpdated={(up) => setItems((old) => old.map((x) => (x.id === up.id ? up : x)))}
              onDeleted={(id) => setItems((old) => old.filter((x) => x.id !== id))}
              onGenerate={generate}
            />
          ))}
        </div>
      )}

      {preview && (
        <div className="modal-back" onClick={() => setPreview(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>QR code downloaded</h2>
            <p className="modal-files">
              <b>{preview.filename}</b> · fixed {preview.width} × {preview.height} PNG
            </p>
            <img className="qr-img" src={preview.url} alt="QR code" />
            <div className="row" style={{ justifyContent: 'center' }}>
              <button
                className="btn dark"
                onClick={() => downloadBase64(preview.png, preview.filename, 'image/png')}
              >
                Download again
              </button>
              <button className="btn" onClick={() => setPreview(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
