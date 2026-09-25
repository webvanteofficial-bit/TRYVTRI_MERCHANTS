import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import StoreNotice from './StoreNotice';
import { api, getToken, setToken } from '../lib/api';

export default function Layout() {
  const nav = useNavigate();
  const loc = useLocation();
  const [term, setTerm] = useState('');
  const [me, setMe] = useState<{ name: string; email: string }>({ name: '', email: '' });

  useEffect(() => {
    api<{ name: string; email: string }>('/me')
      .then((m) => setMe({ name: m.name, email: m.email || '' }))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (loc.pathname === '/products') {
      setTerm(new URLSearchParams(loc.search).get('q') || '');
    }
  }, [loc.pathname, loc.search]);

  function search(e: React.FormEvent) {
    e.preventDefault();
    const q = term.trim();
    nav('/products' + (q ? '?q=' + encodeURIComponent(q) : ''));
  }

  function logout() {
    setToken(null);
    nav('/auth', { replace: true });
  }

  return (
    <div className="app">
      <aside className="side">
        <div className="brand">
          <img
            src="https://fit.tryvtri.com/logo.png"
            alt=""
            onError={(e) => ((e.currentTarget.style.visibility = 'hidden'))}
          />
          <div>
            <b>TRYVTRI</b>
            <small>QR Studio</small>
          </div>
        </div>
        <nav className="nav">
          <div className="nav-label">Studio</div>
          <NavLink to="/dashboard" className={({ isActive }) => (isActive ? 'on' : '')}>
            Dashboard
          </NavLink>
          <NavLink to="/products" className={({ isActive }) => (isActive ? 'on' : '')}>
            QR Studio
          </NavLink>
          <NavLink to="/records" className={({ isActive }) => (isActive ? 'on' : '')}>
            QR records
          </NavLink>
        </nav>
      </aside>

      <div className="col">
        <header className="topbar">
          <form className="tsearch" onSubmit={search}>
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
              <path d="M16.5 16.5L21 21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <input
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="Find a product by name, SKU or URL…"
            />
          </form>
          <div className="tuser">
            <span className="tname" title={me.email || me.name}>
              <b>{me.name || 'Merchant'}</b>
              {me.email && <span>{me.email}</span>}
            </span>
            <button className="btn" onClick={logout} type="button">
              Logout
            </button>
          </div>
        </header>

        <div className="tnotice">
          <StoreNotice />
        </div>

        <main>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
