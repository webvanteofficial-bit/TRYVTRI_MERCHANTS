"""TRYVTRI QR Studio - local single-user tool.
Products and credentials are stored in data/tryvtri.db via TinyDB (plus a readable
mirror at data/catalog.json). Login is enforced:  IBRI / I_1B2
Run:  py -m uvicorn main:app --reload      then open http://localhost:8000
"""
import asyncio
import csv, io, json, os, re, secrets, zipfile
from pathlib import Path
from urllib.parse import urlparse, urljoin, urlencode, parse_qsl, urlunparse
from datetime import datetime, timedelta

import httpx
from fastapi import FastAPI, HTTPException, BackgroundTasks, Depends, Request, Body
from fastapi.staticfiles import StaticFiles
from fastapi.responses import Response, StreamingResponse, JSONResponse
from pydantic import BaseModel, Field

from qrcard import BASE, UA, check_public, draw_card
from crawler import crawl_store, IMAGES_DIR
from tinydb import TinyDB, Query

DATA = BASE / "data"; DATA.mkdir(exist_ok=True)
CATALOG_FILE = DATA / "catalog.json"
TINY = TinyDB(str(DATA / "tryvtri.db"))
CAPTION = "Scan to try it on"
app = FastAPI(title="TRYVTRI QR Studio")

SESSIONS: dict[str, dict] = {}

def get_session(req: Request) -> str:
    auth_header = req.headers.get("Authorization", "")
    token = ""
    if auth_header.startswith("Bearer "):
        token = auth_header[7:]
    elif auth_header:
        token = auth_header
    if not token:
        raise HTTPException(401, "Not authenticated")
    if token in SESSIONS:
        exp = datetime.fromisoformat(SESSIONS[token]["expires"])
        if datetime.utcnow() < exp:
            return token
        del SESSIONS[token]
    raise HTTPException(401, "Session expired")

@app.post("/api/login")
def login(body: dict = Body(...)):
    u = body.get("username", "").strip().upper()
    p = body.get("password", "")
    if not u or not p:
        raise HTTPException(401, "Username and password required")
    creds = {c.get("username", ""): c.get("password", "") for c in TINY.table("credentials").all()}
    if not creds:
        creds = {"IBRI": "I_1B2"}
    if u not in creds or creds[u] != p:
        raise HTTPException(401, "Invalid username or password")
    tok = secrets.token_hex(16)
    SESSIONS[tok] = {"user": u, "expires": (datetime.utcnow() + timedelta(hours=24)).isoformat()}
    return {"token": tok}

# ---------- storage: one plain JSON file, no database ----------
def load():
    if CATALOG_FILE.exists():
        data = json.loads(CATALOG_FILE.read_text())
        if "brands" not in data:
            data["brands"] = data.pop("branches", [])
        for p in data["products"]:
            p.setdefault("brand_id", None)
            p.setdefault("sku", "")
            p.setdefault("qr_generated", False)
            p.setdefault("qr_brands", [])
            p.setdefault("variant_skus", [])
            p.setdefault("price", "")
            p.setdefault("compare_at_price", "")
            p.setdefault("currency", "")
            p.setdefault("category", "")
            p.setdefault("subcategory", "")
            p.setdefault("product_type", "")
            p.setdefault("description", "")
            p.setdefault("images", [])
            p.setdefault("local_images", [])
            p.setdefault("colors", [])
            p.setdefault("sizes", [])
            p.setdefault("availability", "")
            p.setdefault("metadata", {})
        return data
    return {"products": [], "brands": [], "next_id": 1}

def save(data):
    CATALOG_FILE.write_text(json.dumps(data, indent=2, ensure_ascii=False))
    tprods = TINY.table("products"); tprods.truncate()
    for p in data.get("products", []):
        tprods.insert(p)
    tbr = TINY.table("brands"); tbr.truncate()
    for b in data.get("brands", []):
        tbr.insert(b)
    tid = TINY.table("meta"); tid.upsert({"key": "next_id", "value": data.get("next_id", 1)}, Query().key == "next_id")
    t = TINY.table("catalog")
    t.truncate()
    t.insert({"products": data.get("products", []),
              "brands": data.get("brands", []),
              "next_id": data.get("next_id", 1)})

# ---------- helpers ----------
def slug(s): return re.sub(r"[^a-z0-9]+", "-", (s or "").lower()).strip("-")[:50] or "item"

def tracked(url, brand=None):
    p = urlparse(url); q = dict(parse_qsl(p.query))
    q["ref"] = "tryvtri" + (f"-{slug(brand)}" if brand else "")
    return urlunparse(p._replace(query=urlencode(q)))

def fetch(url):
    for _ in range(4):
        check_public(url)
        r = httpx.get(url, timeout=10, headers=UA, follow_redirects=True)
        return r
    raise ValueError("Too many redirects")

def sku_from_variants(variants):
    for v in (variants or []):
        if v.get("sku"):
            return v["sku"].strip().upper()
    return ""

def page_info(url):
    p = urlparse(url)
    name = re.sub(r"[-_]+", " ", p.path.rstrip("/").split("/")[-1]).strip().title() or p.hostname
    m = re.search(r"/products/([^/?#]+)", p.path)
    if m:
        try:
            r = fetch(f"{p.scheme}://{p.netloc}/products/{m.group(1)}.json")
            if r.status_code == 200:
                pr = r.json()["product"]
                return pr["title"], (pr.get("image") or {}).get("src"), sku_from_variants(pr.get("variants"))
        except Exception:
            pass
    try:
        html = fetch(url).text[:200000]
        og = lambda k: (re.search(r'<meta[^>]+property=["\']og:%s["\'][^>]+content=["\']([^"\']+)' % k, html) or [0, None])[1]
        twitter = lambda k: (re.search(r'<meta[^>]+name=["\']twitter:%s["\'][^>]+content=["\']([^"\']+)' % k, html) or [0, None])[1]
        img = og("image") or twitter("image")
        if not img:
            from bs4 import BeautifulSoup
            soup = BeautifulSoup(html, "html.parser")
            og_img = soup.find("meta", property="og:image") or soup.find("meta", attrs={"name": "og:image"}) or soup.find("meta", property="og:image:url")
            if og_img: img = og_img.get("content", "")
            if not img:
                for t in soup.find_all("meta", property="og:image"):
                    if t.get("content"): img = t["content"]; break
        title = og("title") or twitter("title") or name
        return title, img, ""
    except Exception:
        return name, None, ""

def find_product(data, pid):
    for p in data["products"]:
        if p["id"] == pid:
            return p
    raise HTTPException(404, "Product not found")

def find_brand_name(data, bid):
    if not bid:
        return None
    for b in data["brands"]:
        if b["id"] == bid:
            return b["name"]
    return None

# ---------- import progress tracking ----------
_import_progress = {}

def _make_task_id():
    _import_progress["_counter"] = _import_progress.get("_counter", 0) + 1
    return f"task_{_import_progress['_counter']}"

# ---------- brands ----------
class Name(BaseModel):
    name: str = Field(min_length=1, max_length=60)

@app.get("/api/brands")
def get_brands(cred: str = Depends(get_session)):
    data = load()
    counts = {}
    brand_image = {}
    for p in data["products"]:
        bid = p.get("brand_id")
        if bid:
            counts[bid] = counts.get(bid, 0) + 1
            if bid not in brand_image and p.get("image"):
                brand_image[bid] = p["image"]
    return [{"id": b["id"], "name": b["name"], "count": counts.get(b["id"], 0), "image": brand_image.get(b["id"], "")} for b in data["brands"]]

@app.post("/api/brands")
def add_brand(b: Name, cred: str = Depends(get_session)):
    data = load()
    names = [n.strip() for n in b.name.split(",") if n.strip()]
    added_ids = []
    for n in names:
        bid = data["next_id"]
        data["brands"].append({"id": bid, "name": n[:60]})
        data["next_id"] += 1
        added_ids.append(bid)
    save(data)
    return {"added": len(names), "ids": added_ids}

@app.patch("/api/brands/{bid}")
def rename_brand(bid: int, b: Name, cred: str = Depends(get_session)):
    data = load()
    for br in data["brands"]:
        if br["id"] == bid:
            br["name"] = b.name.strip()[:60]
            save(data)
            return {"ok": True, "name": br["name"]}
    raise HTTPException(404, "Brand not found")

@app.delete("/api/brands/{bid}")
def del_brand(bid: int, cred: str = Depends(get_session)):
    data = load()
    data["brands"] = [b for b in data["brands"] if b["id"] != bid]
    for p in data["products"]:
        if p.get("brand_id") == bid:
            p["brand_id"] = None
    save(data)
    return {"ok": True}

# ---------- products ----------
class Import(BaseModel):
    store: str

class Links(BaseModel):
    urls: list[str] = Field(min_length=1, max_length=50)
    brand_id: int | None = None

class Sku(BaseModel):
    sku: str = Field(max_length=40)

class BrandAssign(BaseModel):
    brand_id: int
    product_ids: list[int]

class StoreImport(BaseModel):
    url: str = Field(min_length=5, max_length=500)
    brand_id: int | None = None

@app.get("/api/products")
def products(q: str = "", brand: int = 0, cred: str = Depends(get_session)):
    data = load()
    items = data["products"]
    if brand:
        items = [p for p in items if p.get("brand_id") == brand]
    if q:
        q = q.lower()
        items = [p for p in items if q in p["name"].lower() or q in (p.get("sku") or "").lower() or q in (p.get("category") or "").lower()]
    return list(reversed(items))

@app.patch("/api/products/{pid}")
def set_sku(pid: int, b: Sku, cred: str = Depends(get_session)):
    data = load()
    find_product(data, pid)["sku"] = b.sku.strip().upper()
    save(data)
    return {"ok": True}

@app.patch("/api/products/{pid}/brand")
def set_product_brand(pid: int, body: dict, cred: str = Depends(get_session)):
    data = load()
    p = find_product(data, pid)
    p["brand_id"] = body.get("brand_id")
    save(data)
    return {"ok": True}

@app.post("/api/products/assign-brand")
def assign_brand(b: BrandAssign, cred: str = Depends(get_session)):
    data = load()
    count = 0
    for pid in b.product_ids:
        for p in data["products"]:
            if p["id"] == pid:
                p["brand_id"] = b.brand_id
                count += 1
                break
    save(data)
    return {"ok": True, "assigned": count}

# ---------- store import (generic crawler) ----------
async def _run_import(task_id: str, url: str, brand_id: int | None):
    data = load()
    existing_urls = {p["url"] for p in data["products"]}
    added = 0

    async def progress_cb(msg):
        _import_progress[task_id] = {"status": "running", "message": msg, "added": added}

    _import_progress[task_id] = {"status": "running", "message": "Starting crawler …", "added": 0}

    try:
        brand_name = None
        if brand_id:
            for b in data["brands"]:
                if b["id"] == brand_id:
                    brand_name = b["name"]
                    break

        result = await crawl_store(url, brand_name, progress_cb)

        for p in result.get("products", []):
            prod_url = p.get("url", "")
            if not prod_url or prod_url in existing_urls:
                continue

            images = p.get("images", [])
            local_images = p.get("local_images", [])
            primary_image = ""
            if local_images:
                primary_image = local_images[0]
            elif images:
                primary_image = images[0]

            data["products"].append({
                "id": data["next_id"],
                "name": p.get("name", ""),
                "url": prod_url,
                "image": primary_image,
                "sku": p.get("sku", ""),
                "variant_skus": p.get("variant_skus", []),
                "brand_id": brand_id,
                "price": p.get("price", ""),
                "compare_at_price": p.get("compare_at_price", ""),
                "currency": p.get("currency", ""),
                "category": p.get("category", ""),
                "subcategory": p.get("subcategory", ""),
                "product_type": p.get("product_type", ""),
                "description": p.get("description", ""),
                "images": images,
                "local_images": local_images,
                "colors": p.get("colors", []),
                "sizes": p.get("sizes", []),
                "availability": p.get("availability", ""),
                "metadata": p.get("metadata", {}),
            })
            data["next_id"] += 1
            existing_urls.add(prod_url)
            added += 1

        save(data)
        _import_progress[task_id] = {"status": "done", "message": f"Imported {added} products", "added": added}

    except Exception as e:
        _import_progress[task_id] = {"status": "error", "message": str(e), "added": added}

@app.post("/api/products/import-store")
def import_store(body: StoreImport, background_tasks: BackgroundTasks, cred: str = Depends(get_session)):
    url = body.url.strip()
    if not url.startswith("http"):
        url = "https://" + url
    try:
        parsed = urlparse(url)
        if not parsed.netloc:
            raise ValueError("Invalid URL")
    except Exception:
        raise HTTPException(400, "Invalid URL")

    task_id = _make_task_id()
    _import_progress[task_id] = {"status": "queued", "message": "Queued …", "added": 0}
    background_tasks.add_task(_run_import, task_id, url, body.brand_id)
    return {"task_id": task_id}

@app.get("/api/products/import-store/status")
def import_status(task_id: str, cred: str = Depends(get_session)):
    info = _import_progress.get(task_id)
    if not info:
        raise HTTPException(404, "Task not found")
    return info

# ---------- legacy Shopify import (kept for backward compat) ----------
@app.post("/api/products/import")
def import_catalog(b: Import, cred: str = Depends(get_session)):
    s = b.store.strip(); s = s if s.startswith("http") else "https://" + s
    p = urlparse(s); base = f"{p.scheme}://{p.netloc}"
    data = load()
    existing = {p["url"] for p in data["products"]}
    added = 0
    try:
        for page in range(1, 9):
            r = fetch(f"{base}/products.json?limit=250&page={page}")
            items = r.json()["products"] if r.status_code == 200 else []
            for it in items:
                url = f"{base}/products/{it['handle']}"
                if url in existing:
                    continue
                img = (it.get("images") or [{}])[0].get("src")
                data["products"].append({"id": data["next_id"], "name": it["title"], "url": url,
                                         "image": img, "sku": sku_from_variants(it.get("variants")),
                                         "brand_id": None})
                data["next_id"] += 1; existing.add(url); added += 1
            if len(items) < 250:
                break
    except Exception:
        pass
    save(data)
    if not added:
        raise HTTPException(400, "Could not read this store's catalog. Add the product links instead.")
    return {"added": added}

@app.post("/api/products/add")
def add_products(b: Links, cred: str = Depends(get_session)):
    data = load()
    existing = {p["url"] for p in data["products"]}
    brand_id = b.brand_id
    if brand_id and not any(br["id"] == brand_id for br in data["brands"]):
        raise HTTPException(400, "Brand not found")
    added, errors = 0, []
    for raw in filter(None, (x.strip() for x in b.urls)):
        raw = raw if re.match(r"https?://", raw, re.I) else "https://" + raw
        if raw in existing:
            continue
        try:
            check_public(raw)
        except Exception:
            errors.append(f"{raw}: Website not allowed"); continue
        name, img, sku = page_info(raw)
        data["products"].append({"id": data["next_id"], "name": name, "url": raw,
                                  "image": img, "sku": sku, "brand_id": brand_id})
        data["next_id"] += 1; existing.add(raw); added += 1
    save(data)
    return {"added": added, "errors": errors}

@app.delete("/api/products/{pid}")
def del_product(pid: int, cred: str = Depends(get_session)):
    data = load()
    data["products"] = [p for p in data["products"] if p["id"] != pid]
    save(data)
    return {"ok": True}

@app.get("/api/products/{pid}/qr.png")
def product_qr(pid: int, brand: int = 0, cred: str = Depends(get_session)):
    data = load()
    p = find_product(data, pid)
    bn = find_brand_name(data, brand)
    png = draw_card(tracked(p["url"], bn), p["name"], CAPTION, p.get("sku") or "")
    p["qr_generated"] = True
    if bn:
        qr_brands = p.setdefault("qr_brands", [])
        if bn not in qr_brands:
            qr_brands.append(bn)
    save(data)
    fname = slug(f"{p.get('sku','')} {p['name']}")
    return Response(png, media_type="image/png",
                    headers={"Content-Disposition": f'attachment; filename="{fname}-qr.png"'})

# ---------- image serving ----------
@app.get("/api/images/{filename}")
def serve_image(filename: str):
    fpath = IMAGES_DIR / filename
    if not fpath.exists():
        raise HTTPException(404, "Image not found")
    data_bytes = fpath.read_bytes()
    ext = fpath.suffix.lower()
    ct = {"jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png", "webp": "image/webp"}.get(ext.lstrip("."), "image/jpeg")
    return Response(data_bytes, media_type=ct)

# ---------- export ----------
class Export(BaseModel):
    ids: list[int] = []
    per_branch: bool = False
    brand_id: int | None = None

@app.post("/api/export")
def export(b: Export, cred: str = Depends(get_session)):
    data = load()
    prods = [p for p in data["products"] if not b.ids or p["id"] in b.ids]
    if b.brand_id:
        bn = find_brand_name(data, b.brand_id)
        if not bn:
            raise HTTPException(404, "Brand not found")
        brs = [bn]
    else:
        brs = [br["name"] for br in data["brands"]] if b.per_branch else [None]
    if not prods:
        raise HTTPException(400, "No products to export")
    if b.per_branch and not brs:
        raise HTTPException(400, "Add your brands first, or turn off per-brand codes")
    if len(prods) * len(brs) > 1500:
        raise HTTPException(400, "That is more than 1500 codes. Select fewer products.")
    buf, man = io.BytesIO(), io.StringIO()
    w = csv.writer(man); w.writerow(["brand", "sku", "product", "product_url", "qr_link", "file"])
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for br in brs:
            for n, p in enumerate(prods, 1):
                t = tracked(p["url"], br)
                fname = f"{slug(br) if br else 'all-brands'}/{slug(p.get('sku',''))}-{slug(p['name'])}-{n:03d}.png"
                z.writestr(fname, draw_card(t, p["name"], CAPTION, p.get("sku") or ""))
                w.writerow([br or "all", p.get("sku", ""), p["name"], p["url"], t, fname])
        z.writestr("manifest.csv", man.getvalue())
    for p in prods:
        p["qr_generated"] = True
    save(data)
    return Response(buf.getvalue(), media_type="application/zip",
                    headers={"Content-Disposition": 'attachment; filename="tryvtri-qr-codes.zip"'})

app.mount("/", StaticFiles(directory=BASE.parent / "frontend", html=True), name="ui")
