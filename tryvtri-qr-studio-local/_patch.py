import sys
from pathlib import Path

BASE = Path(r'C:\Users\DEll\Downloads\tryvtri-qr-studio-local')
BD = BASE / 'backend'
F = BD / 'main.py'

src = open(F, encoding='utf-8').read()

edits = []

def rep(old, new, required=True):
    n = src.count(old)
    if n == 0:
        if required:
            raise SystemExit('ANCHOR NOT FOUND: %r' % old[:80])
        return
    if n > 1 and required:
        raise SystemExit('ANCHOR AMBIGUOUS (%d): %r' % (n, old[:80]))
    edits.append((old, new))

# -- 1) module docstring: mention TinyDB + credentials --
rep('''"""TRYVTRI QR Studio - local single-user tool.
No login, no database - just one JSON file (data/catalog.json) you can open and read yourself.
Run:  uvicorn main:app --reload      then open http://localhost:8000
"""''',
'''"""TRYVTRI QR Studio - local single-user tool.
Backed by TinyDB (data/tryvtri.db) with a readable mirror at data/catalog.json.
Credentials are stored inside the same TinyDB file.
Run:  py -m uvicorn main:app --reload      then open http://localhost:8000
"""''')

# -- 2) enforce login: username IBRI / password I_1B2 --
rep('''@app.post("/api/login")
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
    u = body.get("username", "").strip()
    p = body.get("password", "")
    EXPECTED = {"username": "IBRI", "password": "I_1B2"}
    stored = auth_config()
    user = (u or stored.get("username") or "").strip().upper()
    pwd = p or stored.get("password") or ""
    if user != EXPECTED["username"] or pwd != EXPECTED["password"]:
        raise HTTPException(401, "Invalid username or password")
    tok = secrets.token_hex(16)
    SESSIONS[tok] = {"user": user, "expires": (datetime.utcnow() + timedelta(hours=24)).isoformat()}
    return {"token": tok}''')

open(BD / '_patch_plan.txt', 'w', encoding='utf-8').write('\n\n'.join('OLD(len %d) :: %r\nNEW :: %r' % (len(o), o[:40], n[:60]) for o, n in edits))
print('PLANNED', len(edits), 'edits, anchors all found')
