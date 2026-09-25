# -*- coding: utf-8 -*-
import io, sys
so = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
B = r'C:\Users\DEll\Downloads\tryvtri-qr-studio-local'
F = B + r'\frontend\index.html'
R = B + r'\requirements.txt'
fails = []
def rep(s, old, new, tag, once=True):
    if old not in s:
        fails.append(tag); so.write('[FAIL anchor] %s\n' % tag); return s
    n = s.count(old)
    if once and n != 1:
        fails.append(tag); so.write('[FAIL ambig %d] %s\n' % (n, tag)); return s
    so.write('[OK] %s\n' % tag)
    return s.replace(old, new, 1)

s = open(F, encoding='utf-8').read()
# --- F3: section id v-branches -> v-brands + heading/text ---
s = rep(s, '<section id="v-branches" hidden>', '<section id="v-brands" hidden>', 'SEC_BRANDS_ID')
s = rep(s, '<h1>Branches</h1>', '<h1>Brands</h1>', 'H1_BRANDS')
s = rep(s, '''<p class="sub">The same QR works in every branch. Add branches only if you want to see scans per branch: each
          branch gets its own tracked code.</p>''',
'''<p class="sub">The same QR works for every brand. Add brands only if you want to see scans per brand: each
          brand gets its own tracked code.</p>''', 'SUB_BRANDS')
s = rep(s, '<label class="f" for="bn" style="margin-top:0">Branch names, separated by commas</label>',
              '<label class="f" for="bn" style="margin-top:0">Brand names, separated by commas</label>', 'LBL_BRANDNAMES')
s = rep(s, 'placeholder="Lahore, Islamabad, Karachi"', 'placeholder="Lahore, Islamabad, Karachi"', 'PH_PLACEHOLDER')
s = rep(s, '<button class="btn pri" id="bad">Add branches</button>', '<button class="btn pri" id="bad">Add brands</button>', 'BTN_ADDBRANDS')

# --- F4: bsel option + pb label cosmetics ---
s = rep(s, '<option value="0">All branches (same code)</option>', '<option value="0">All brands (same code)</option>', 'OPT_ALLBRANDS')
s = rep(s, 'Separate codes per branch in ZIP', 'Separate codes per brand in ZIP', 'LBL_PERBRAND')

# --- F1: api() with Authorization + auto-login ---
s = rep(s, '''    async function api(p, o = {}) {
      const r = await fetch('/api' + p, { method: o.method || 'GET', headers: { 'Content-Type': 'application/json' }, body: o.body ? JSON.stringify(o.body) : undefined });
      if (!r.ok) { let d = 'Something went wrong'; try { d = (await r.json()).detail || d } catch { } throw new Error(typeof d === 'string' ? d : 'Check the values you entered') }
      return r
    }''',
'''    let TOK = localStorage.getItem('tv_tok') || '';
    async function ensureToken() {
      if (TOK) return TOK;
      const r = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'IBRI', password: 'I_1B2' }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.token) throw new Error(d.detail || 'Login failed');
      TOK = d.token; localStorage.setItem('tv_tok', TOK); return TOK
    }
    async function api(p, o = {}) {
      if (o.auth !== false && !TOK) { try { await ensureToken() } catch { } }
      const h = { 'Content-Type': 'application/json' };
      if (TOK) h['Authorization'] = 'Bearer ' + TOK;
      const r = await fetch('/api' + p, { method: o.method || 'GET', headers: h, body: o.body ? JSON.stringify(o.body) : undefined });
      if (r.status === 401 && o.auth !== false) {
        TOK = ''; localStorage.removeItem('tv_tok'); await ensureToken();
        return api(p, { ...o, auth: false })
      }
      if (!r.ok) { let d = 'Something went wrong'; try { d = (await r.json()).detail || d } catch { } throw new Error(typeof d === 'string' ? d : 'Check the values you entered') }
      return r
    }''', 'API_AUTH')

# --- F7: fix loadBrands (branches -> brands vars + /brands URLs + toasts) ---
s = rep(s, "$('bsel').innerHTML = '<option value=\"0\">All branches (same code)</option>' + branches.map(b => `<option value=\"${b.id}\">${esc(b.name)}</option>`).join('');",
              "$('bsel').innerHTML = '<option value=\"0\">All brands (same code)</option>' + brands.map(b => `<option value=\"${b.id}\">${esc(b.name)}</option>`).join('');", 'LB_BRANDS_MAP')
s = rep(s, '''$('bl').innerHTML = branches.length ? branches.map(b => `<div class="hist"><b>${esc(b.name)}</b><button class="btn d" data-b="${b.id}">Remove</button></div>`).join('') : '<div class="empty" style="margin:0">No branches yet.</div>';''',
'''$('bl').innerHTML = brands.length ? brands.map(b => `<div class="hist"><b>${esc(b.name)}</b><button class="btn d" data-b="${b.id}">Remove</button></div>`).join('') : '<div class="empty" style="margin:0">No brands yet.</div>';''', 'LB_BRANDS_LIST')
s = rep(s, "await api('/branches/' + x.dataset.b, { method: 'DELETE' }); loadBrands()", "await api('/brands/' + x.dataset.b, { method: 'DELETE' }); loadBrands()", 'LB_DELETE_URL')
s = rep(s, "const r = await (await api('/branches', { method: 'POST', body: { name: $('bn').value } })).json(); $('bn').value = ''; toast(r.added + ' branches added'); loadBrands()",
            "const r = await (await api('/brands', { method: 'POST', body: { name: $('bn').value } })).json(); $('bn').value = ''; toast(r.added + ' brands added'); loadBrands()", 'LB_ADD_URL')

# --- F5: whole-store import via import-store + status poll ---
s = rep(s, "on('imp', async () => { $('imp').textContent = 'Importing...'; try { const r = await (await api('/products/import', { method: 'POST', body: { store: $('store').value } })).json(); toast(r.added + ' products added'); await loadProducts() } finally { $('imp').textContent = 'Import catalog' } });",
"""on('imp', async () => { $('imp').textContent = 'Importing...'; try {
      const r = await (await api('/products/import-store', { method: 'POST', body: { url: $('store').value } })).json();
      const tid = r.task_id;
      for (let i = 0; i < 1200; i++) {
        await new Promise(res => setTimeout(res, 800));
        const st = await (await api('/products/import-store/status?task_id=' + tid)).json();
        if (st.status === 'done') { toast(st.added + ' products imported' + (st.message ? ' \\u2014 ' + st.message : '') ); await loadProducts(); break }
        if (st.status === 'error' || st.status === 'failed') { toast(st.message || 'Import failed', 1); break }
        $('imp').textContent = (st.added ?? 0) + ' imported\\u2026'
      }
    } finally { $('imp').textContent = 'Import catalog' } });""", 'IMP_STORE')

# --- F2: ensure token before boot data load (after let brands line) ---
s = rep(s, "loadBrands(); loadProducts();", "ensureToken().then(safe(async () => { await loadBrands(); await loadProducts() })).catch(() => {});", 'BOOT_AUTH')

open(F, 'w', encoding='utf-8').write(s)

# --- requirements (root): tinydb ---
r = open(R, encoding='utf-8').read()
if 'tinydb' not in r.lower():
    r = r.rstrip() + '\ntinydb\n'
    open(R, 'w', encoding='utf-8').write(r)
    so.write('[OK] requirements += tinydb\n')
else:
    so.write('[SKIP] tinydb already in requirements\n')

if fails:
    so.write('FAILURES: %r\n' % fails)
else:
    so.write('FRONTEND_ALL_OK\n')
