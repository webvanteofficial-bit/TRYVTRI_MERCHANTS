# -*- coding: utf-8 -*-
import io, sys
so = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
B = r'C:\Users\DEll\Downloads\tryvtri-qr-studio-local'
M = B + r'\backend\main.py'
R = B + r'\requirements.txt'
fails = []

def rep(path, old, new, tag, once=True):
    s = open(path, encoding='utf-8').read()
    if old not in s:
        fails.append(tag); so.write('[FAIL anchor] %s\n' % tag); return s
    n = s.count(old)
    if once and n != 1:
        fails.append(tag); so.write('[FAIL ambig %d] %s\n' % (n, tag)); return s
    s = s.replace(old, new, 1)
    open(path, 'w', encoding='utf-8').write(s)
    so.write('[OK] %s\n' % tag)
    return s

# ---------------- login: enforce IBRI / I_1B2, seed + read creds via TinyDB ----------------
s = rep(M, '''@app.post("/api/login")
def login(body: dict = Body(...)):
    u = body.get("username", "").strip()
    p = body.get("password", "")
    if not u or not p:
        raise HTTPException(401, "Username and password required")
    tok = secrets.token_hex(16)
    SESSIONS[tok] = {"user": u, "expires": (datetime.utcnow() + timedelta(hours=24)).isoformat()}
    return {"token": tok}''',
'''@app.post("/api/login")
def login(body: dict = Body(...)):
    u = body.get("username", "").strip().upper()
    p = body.get("password", "")
    if not u or not p:
        raise HTTPException(401, "Username and password required")
    creds = TINY.table("credentials")
    if not creds.all():
        creds.insert({"username": "IBRI", "password": "I_1B2"})
    ok = False
    for row in creds.all():
        if (row.get("username") or "").strip().upper() == u and row.get("password") == p:
            ok = True
            break
    if not ok:
        raise HTTPException(401, "Invalid username or password")
    tok = secrets.token_hex(16)
    SESSIONS[tok] = {"user": u, "expires": (datetime.utcnow() + timedelta(hours=24)).isoformat()}
    return {"token": tok}''',
'LOGIN_IBRI')

# ---------------- save(): persist products+brands+credentials into TinyDB alongside catalog.json ----------------
s = rep(M, '''def save(data):
    CATALOG_FILE.write_text(json.dumps(data, indent=2, ensure_ascii=False))''',
'''def save(data):
    CATALOG_FILE.write_text(json.dumps(data, indent=2, ensure_ascii=False))
    tprods = TINY.table("products"); tprods.truncate()
    for p in data.get("products", []):
        tprods.insert(p)
    tbr = TINY.table("brands"); tbr.truncate()
    for b in data.get("brands", []):
        tbr.insert(b)
    tid = TINY.table("meta"); tid.upsert({"key": "next_id", "value": data.get("next_id", 1)}, Query().key == "next_id")''',
'SAVE_TINYDB')

# ---------------- requirements.txt (root): add tinydb ----------------
rq = open(R, encoding='utf-8').read()
if 'tinydb' not in rq.lower():
    rq = rq.rstrip() + '\ntinydb\n'
    open(R, 'w', encoding='utf-8').write(rq)
    so.write('[OK] requirements += tinydb\n')
else:
    so.write('[SKIP] tinydb already in requirements\n')

if fails:
    so.write('FAILURES: %r\n' % fails)
else:
    so.write('ALL_OK backend-login-tinydb\n')
