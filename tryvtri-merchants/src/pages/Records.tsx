import { useEffect, useState } from 'react';
import { api, type Product, type QrRecord } from '../lib/api';
import { toast } from '../lib/toast';

function fmtDate(s: string) {
  try {
    return new Date(s).toLocaleString(undefined, {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return s;
  }
}

export default function Records() {
  const [rows, setRows] = useState<QrRecord[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api<QrRecord[]>('/records'), api<Product[]>('/products')])
      .then(([r, p]) => {
        setRows(r);
        setProducts(p);
      })
      .catch((e) => toast(e.message, true))
      .finally(() => setLoading(false));
  }, []);

  const total = products.reduce((n, p) => n + (p.qr_count || 0), 0);
  const withQr = products.filter((p) => (p.qr_count || 0) > 0).length;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>QR records</h1>
          <p className="sub">
            {loading
              ? 'Loading…'
              : total + ' QR code' + (total === 1 ? '' : 's') + ' downloaded across ' +
                withQr + ' product' + (withQr === 1 ? '' : 's')}
          </p>
        </div>
      </div>

      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>QR codes per product</h2>
            <p className="panel-desc">The full count for every product in your catalog.</p>
          </div>
        </div>
        <div className="count-list" style={{ marginTop: 8 }}>
          {products.length === 0 ? (
            <div className="empty" style={{ margin: 0 }}>
              No products yet.
            </div>
          ) : (
            products.map((p) => {
              const n = p.qr_count || 0;
              return (
                <div className="count-row" key={p.id}>
                  <div className="who">
                    <b>{p.name || 'Untitled product'}</b>
                    <span>{p.sku ? 'SKU ' + p.sku : 'No SKU'}</span>
                  </div>
                  <span className={'count-n' + (n ? ' on' : '')}>{n}</span>
                </div>
              );
            })
          )}
        </div>
      </section>

      <div className="bar">
        <span className="meta">
          {loading ? 'Loading…' : rows.length + ' download' + (rows.length === 1 ? '' : 's') + ' recorded'}
        </span>
      </div>

      {rows.length === 0 && !loading ? (
        <div className="empty">No QR records yet. Generate a QR from the QR Studio.</div>
      ) : (
        <div className="panel tbl-card" style={{ marginBottom: 0 }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>When</th>
                <th>Product</th>
                <th>SKU</th>
                <th>Product link</th>
                <th>File</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="td-when">{fmtDate(r.created_at)}</td>
                  <td className="td-name">
                    {r.product_name || 'Untitled product'}
                    {r.product_id === null && <span className="tag">deleted</span>}
                  </td>
                  <td>{r.sku ? <b>{r.sku}</b> : <span className="mut">—</span>}</td>
                  <td className="td-url">
                    <a href={r.url} target="_blank" rel="noopener">
                      {r.url}
                    </a>
                  </td>
                  <td>
                    <span className="qrb ok">
                      <span className="dot ok" />
                      PNG 1000×1300
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
