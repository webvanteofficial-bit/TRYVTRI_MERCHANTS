import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { api, getToken, setToken } from '../lib/api';

export default function Auth() {
  const nav = useNavigate();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  if (getToken()) return <Navigate to="/dashboard" replace />;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    if (mode === 'signup' && pw !== pw2) {
      setErr('Passwords do not match');
      return;
    }
    setBusy(true);
    try {
      const r = await api<{ token: string }>('/' + mode, {
        method: 'POST',
        body: mode === 'signup' ? { name, email, password: pw } : { name, password: pw },
      });
      setToken(r.token);
      nav('/dashboard', { replace: true });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="auth-brand">
          <img src="https://fit.tryvtri.com/logo.png" alt="" onError={(e) => (e.currentTarget.style.display = 'none')} />
          <div>
            <b>TRYVTRI</b>
            <small>QR Studio for Merchants</small>
          </div>
        </div>

        <div className="auth-tabs">
          <button type="button" className={mode === 'login' ? 'on' : ''} onClick={() => { setMode('login'); setErr(''); }}>
            Login
          </button>
          <button type="button" className={mode === 'signup' ? 'on' : ''} onClick={() => { setMode('signup'); setErr(''); }}>
            Sign up
          </button>
        </div>

        <h1 className="auth-h">{mode === 'login' ? 'Welcome back' : 'Create your account'}</h1>
        <p className="sub auth-sub" style={{ margin: '0 0 6px' }}>
          {mode === 'login'
            ? 'Sign in with your username and password to open your QR studio.'
            : 'Register a username, email and password to start generating QR codes.'}
        </p>

        <form className="auth-form" onSubmit={submit}>
          <label className="f" htmlFor="a-name">Username</label>
          <input
            id="a-name"
            type="text"
            autoComplete="username"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your username"
            required
          />

          {mode === 'signup' && (
            <>
              <label className="f" htmlFor="a-email">Email</label>
              <input
                id="a-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@store.com"
                required
              />
            </>
          )}

          <label className="f" htmlFor="a-pw">Password</label>
          <input
            id="a-pw"
            type="password"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            placeholder="••••••••"
            required
          />

          {mode === 'signup' && (
            <>
              <label className="f" htmlFor="a-pw2">Confirm password</label>
              <input
                id="a-pw2"
                type="password"
                autoComplete="new-password"
                value={pw2}
                onChange={(e) => setPw2(e.target.value)}
                placeholder="••••••••"
                required
              />
            </>
          )}

          {err && <div className="form-err">{err}</div>}

          <div className="row">
            <button className="btn pri" type="submit" disabled={busy}>
              {busy ? 'Please wait…' : mode === 'login' ? 'Login' : 'Create account'}
            </button>
          </div>
        </form>

        <div className="auth-switch">
          {mode === 'login' ? (
            <>
              New here?{' '}
              <button type="button" className="lnk" onClick={() => { setMode('signup'); setErr(''); }}>
                Create an account
              </button>
            </>
          ) : (
            <>
              Already registered?{' '}
              <button type="button" className="lnk" onClick={() => { setMode('login'); setErr(''); }}>
                Login
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
