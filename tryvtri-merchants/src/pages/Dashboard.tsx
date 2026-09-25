import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type Stats } from '../lib/api';
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

const Ico = {
  box: (
    <svg viewBox="0 0 24 24" fill="none">
      <path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5v-9Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="m3 7.5 9 4.5 9-4.5M12 12v9" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  ),
  qr: (
    <svg viewBox="0 0 24 24" fill="none">
      <rect x="3" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M14 14h3v3h-3zM20 14h1M14 20h3M20 18v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  ),
  clock: (
    <svg viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 7v5.2l3.2 1.9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  ),
};

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    api<Stats>('/stats')
      .then(setStats)
      .catch((e) => {
        setErr(e.message);
        toast(e.message, true);
      });
  }, []);

  if (err) return <div className="empty">{err}</div>;
  if (!stats) return <div className="empty">Loading your dashboard…</div>;

  const pct = stats.products ? Math.round((stats.qr_generated / stats.products) * 100) : 0;
  const top = stats.per_product || [];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Hello, {stats.merchant.name}</h1>
          <p className="sub">Here is your QR studio at a glance.</p>
        </div>
        <div className="panel-actions">
          <Link className="btn" to="/records">
            QR history
          </Link>
          <Link className="btn dark" to="/products">
            Generate QR
          </Link>
        </div>
      </div>

      <div className="stats">
        <div className="stat">
          <div className="stat-top">
            <span className="stat-l" style={{ margin: 0 }}>Products</span>
            <span className="stat-ico">{Ico.box}</span>
          </div>
          <div className="stat-n">{stats.products}</div>
          <div className="stat-l">Saved in your catalog</div>
          <Link className="lnk" to="/products">Add a product</Link>
        </div>

        <div className="stat">
          <div className="stat-top">
            <span className="stat-l" style={{ margin: 0 }}>QR ready</span>
            <span className="stat-ico amber">{Ico.qr}</span>
          </div>
          <div className="stat-n">{stats.qr_generated}</div>
          <div className="stat-l">Products with a QR code</div>
          <Link className="lnk" to="/products">Generate QR codes</Link>
        </div>

        <div className="stat">
          <div className="stat-top">
            <span className="stat-l" style={{ margin: 0 }}>Downloads</span>
            <span className="stat-ico green">{Ico.clock}</span>
          </div>
          <div className="stat-n">{stats.qr_records}</div>
          <div className="stat-l">QR codes downloaded</div>
          <Link className="lnk" to="/records">View history</Link>
        </div>
      </div>

      {/* ------------------------------------------------- usage (reference) */}
      <section className="panel">
        <div className="split">
          <div className="grow">
            <div className="eyebrow">
              QR CODES <span className="pill">all products</span>
            </div>
            <div className="big-num">
              {stats.qr_generated} <span>/ {stats.products} products have a QR</span>
            </div>
            <div className="meter">
              <i style={{ width: (stats.products ? Math.max(pct, 2) : 0) + '%' }} />
            </div>
            <p className="meter-note">
              Every product can be reprinted as many times as you like — each download is counted
              per product.
            </p>
          </div>
          <Link className="btn" to="/records">
            View records
          </Link>
        </div>
      </section>

      {/* ------------------------------------------------------ product QR */}
      <section className="panel">
        <h2>Product QR</h2>
        <p className="panel-desc">
          Print a QR code for any product to launch Real-Time Try-On in-store.
        </p>
        <div className="row" style={{ marginTop: 18 }}>
          <Link className="btn" to="/products">
            Manage products
          </Link>
          <Link className="btn" to="/products">
            View all {stats.products} product{stats.products === 1 ? '' : 's'}
          </Link>
          <Link className="btn dark" to="/products">
            Generate QR
          </Link>
        </div>
      </section>

      {/* ----------------------------------------------------- two columns */}
      <div className="two" style={{ gap: 18, marginTop: 18 }}>
        <section className="panel" style={{ marginBottom: 0 }}>
          <h2>Recent QR activity</h2>
          <p className="panel-desc">Every QR you download is recorded here.</p>
          <div style={{ marginTop: 8 }}>
            {stats.recent_records.length === 0 ? (
              <div className="empty" style={{ margin: 0 }}>
                No QR codes yet. Open <Link className="lnk" to="/products">QR Studio</Link> and hit
                Generate QR.
              </div>
            ) : (
              stats.recent_records.map((r) => (
                <div className="hist" key={r.id}>
                  <div>
                    <div className="n">{r.product_name || 'Untitled product'}</div>
                    <div className="sub" style={{ margin: 0 }}>
                      {r.sku ? 'SKU: ' + r.sku + ' · ' : ''}
                      {fmtDate(r.created_at)}
                    </div>
                  </div>
                  <a className="btn sm" href={r.url} target="_blank" rel="noopener">
                    Open
                  </a>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="panel" style={{ marginBottom: 0 }}>
          <h2>QR codes per product</h2>
          <p className="panel-desc">How many QR codes you have downloaded for each product.</p>
          <div className="count-list" style={{ marginTop: 8 }}>
            {top.length === 0 ? (
              <div className="empty" style={{ margin: 0 }}>
                No products yet.{' '}
                <Link className="lnk" to="/products">
                  Add your first product
                </Link>
                .
              </div>
            ) : (
              top.map((p) => (
                <div className="count-row" key={p.id}>
                  <div className="who">
                    <b>{p.name || 'Untitled product'}</b>
                    <span>{p.sku ? 'SKU ' + p.sku : 'No SKU'}</span>
                  </div>
                  <span className={'count-n' + (p.qr_count ? ' on' : '')}>{p.qr_count}</span>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </>
  );
}
