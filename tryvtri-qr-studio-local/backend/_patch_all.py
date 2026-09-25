# -*- coding: utf-8 -*-
import io, sys
so = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
B = r'C:\Users\DEll\Downloads\tryvtri-qr-studio-local'
R = B + r'\requirements.txt'
M = B + r'\backend\main.py'
F = B + r'\frontend\index.html'

fails = []
def rep_in(s, old, new, tag):
    if old not in s:
        so.write('[FAIL] %s (anchor missing)\n' % tag); fails.append(tag); return s
    if s.count(old) != 1:
        so.write('[FAIL] %s (ambig %d)\n' % (tag, s.count(old))); fails.append(tag); return s
    so.write('[OK] %s\n' % tag)
    return s.replace(old, new, 1)

# ---------------- requirements.txt (root): add tinydb ----------------
r = open(R, encoding='utf-8').read()
if 'tinydb' not in r.lower():
    r = r.rstrip() + '\ntinydb\n'
    open(R, 'w', encoding='utf-8').write(r)
    so.write('[OK] requirements += tinydb\n')
else:
    so.write('[SKIP] tinydb already in requirements\n')

# ---------------- main.py: tinydb import near crawler import ----------------
s = open(M, encoding='utf-8').read()
s = rep_in(s, 'from crawler import crawl_store, IMAGES_DIR',
              'from crawler import crawl_store, IMAGES_DIR\nfrom tinydb import TinyDB, Query', 'MAIN_TINYDB_IMPORT')

# tinydb handle after CATALOG_FILE
s = rep_in(s, 'CATALOG_FILE = DATA / "catalog.json"',
              'CATALOG_FILE = DATA / "catalog.json"\nTINY = TinyDB(str(DATA / "tryvtri.db"))', 'MAIN_TINYDB_HANDLE')

# login: enforce IBRI / I_1B2 from credentials table (default IBRI / I_1B2)
s = rep_in(s, '''    u = body.get("username", "").strip()
    p = body.get("password", "")
    if not u or not p:
        raise HTTPException(401, "Username and password required")''',
'''    u = body.get("username", "").strip().upper()
    p = body.get("password", "")
    if not u or not p:
        raise HTTPException(401, "Username and password required")
    creds = {c.get("username", ""): c.get("password", "") for c in TINY.table("credentials").all()}
    if not creds:
        creds = {"IBRI": "I_1B2"}
    if u not in creds or creds[u] != p:
        raise HTTPException(401, "Invalid username or password")''', 'MAIN_LOGIN_ENFORCE')

# save(): also persist into tinydb (products + brands)
s = rep_in(s, '''def save(data):
    CATALOG_FILE.write_text(json.dumps(data, indent=2, ensure_ascii=False))''',
'''def save(data):
    CATALOG_FILE.write_text(json.dumps(data, indent=2, ensure_ascii=False))
    t = TINY.table("catalog")
    t.truncate()
    t.insert({"products": data.get("products", []),
              "brands": data.get("brands", []),
              "next_id": data.get("next_id", 1)})''', 'MAIN_SAVE_TINYDB')

open(M, 'w', encoding='utf-8').write(s)

# ---------------- frontend: Branches -> Brands + login + whole-store import ----------------
h = open(F, encoding='utf-8').read()

# nav button
h = rep_in(h, '<button data-v="branches">Branches</button>',
              '<button data-v="brands">Brands</button>', 'HTML_NAV_BRANDS')

# branch section header / ids stay (bsel used by product qr), but rename section labels
h = rep_in(h, '<h1>Branches</h1>', '<h1>Brands</h1>', 'HTML_TITLE_BRANDS')
h = rep_in(h, 'loadBranches(); loadProducts();', 'loadBrands(); loadProducts();', 'HTML_LOADINIT')

# JS: rename branches->brands
h = rep_in(h, 'let branches = [], prods = [], sel = new Set();',
              'let brands = [], prods = [], sel = new Set();', 'HTML_VARS')
h = rep_in(h, '''async function loadBranches() {
      branches = await (await api('/branches')).json();''',
'''async function loadBrands() {
      brands = await (await api('/brands')).json();''', 'HTML_LOADBRANDS')
h = rep_in(h, "'branches'].forEach(v => $('v-' + v).hidden = v !== b.dataset.v)",
              "'brands'].forEach(v => $('v-' + v).hidden = v !== b.dataset.v)", 'HTML_SWITCH')

open(F, 'w', encoding='utf-8').write(h)

if fails:
    so.write('FAILURES: %r\n' % fails)
else:
    so.write('ALL_OK main+frontend\n')
