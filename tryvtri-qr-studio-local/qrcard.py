"""Card drawing helpers (QR + logo + TRYVTRI text)."""
import io, ipaddress, os, re, socket
from pathlib import Path
from urllib.parse import urlparse
import httpx, qrcode
from PIL import Image, ImageDraw, ImageFont
from qrcode.constants import ERROR_CORRECT_H

BASE = Path(__file__).parent
LOGO_URL = os.getenv("LOGO_URL", "https://fit.tryvtri.com/logo.png")

_DATA_DIR = None


def data_dir() -> Path:
    """Bundled data/ when writable, otherwise /tmp (serverless read-only fs)."""
    global _DATA_DIR
    if _DATA_DIR is not None:
        return _DATA_DIR
    bundled = BASE / "data"
    chosen = bundled
    try:
        bundled.mkdir(parents=True, exist_ok=True)
        probe = bundled / ".writable"
        probe.write_text("ok")
        probe.unlink()
    except OSError:
        chosen = Path(os.getenv("TMPDIR", "/tmp")) / "tryvtri-data"
        chosen.mkdir(parents=True, exist_ok=True)
        for name in ("catalog.json", "tryvtri.db"):
            if not (chosen / name).exists() and (bundled / name).exists():
                (chosen / name).write_bytes((bundled / name).read_bytes())
    _DATA_DIR = chosen
    return chosen

BRAND = os.getenv("BRAND_TEXT", "TRYVTRI")
GREEN, DARK, GREY = (22, 163, 74), (17, 24, 39), (107, 114, 128)
UA = {"User-Agent": "Mozilla/5.0 TRYVTRI-QR"}
_logo = {"img": None}


def get_logo():
    if _logo["img"]:
        return _logo["img"]
    try:
        local = BASE / "logo.png"
        data = local.read_bytes() if local.exists() else httpx.get(
            LOGO_URL, timeout=5, follow_redirects=True, headers=UA).raise_for_status().content
        _logo["img"] = Image.open(io.BytesIO(data)).convert("RGBA")
    except Exception:
        pass
    return _logo["img"]


def check_public(url: str):
    p = urlparse(url)
    if p.scheme not in ("http", "https") or not p.hostname:
        raise ValueError("Enter a full link that starts with https://")
    try:
        for info in socket.getaddrinfo(p.hostname, None):
            ip = ipaddress.ip_address(info[4][0])
            if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved:
                raise ValueError("This address is not allowed")
    except socket.gaierror:
        raise ValueError("Website not found. Check the link.")


def product_name(url: str) -> str:
    p = urlparse(url)
    slug = p.path.rstrip("/").split("/")[-1]
    fallback = re.sub(r"[-_]+", " ", slug).strip().title() or p.hostname
    m = re.search(r"/products/([^/?#]+)", p.path)
    if m:
        try:
            r = httpx.get(f"{p.scheme}://{p.netloc}/products/{m.group(1)}.json",
                          timeout=5, headers=UA)
            if r.status_code == 200:
                return r.json()["product"]["title"]
        except Exception:
            pass
    return fallback


def font(size: int, bold=True):
    names = ["arialbd.ttf", "DejaVuSans-Bold.ttf"] if bold else ["arial.ttf", "DejaVuSans.ttf"]
    for n in names:
        try:
            return ImageFont.truetype(n, size)
        except OSError:
            pass
    return ImageFont.load_default(size=size)


def draw_card(target: str, name: str, caption: str, code: str = "") -> bytes:
    qr = qrcode.QRCode(error_correction=ERROR_CORRECT_H, border=1)
    qr.add_data(target)
    qr.make(fit=True)
    qr.box_size = max(8, 700 // (qr.modules_count + 2))
    q = qr.make_image(fill_color="black", back_color="white").convert("RGBA")

    logo = get_logo()
    size = int(q.width * 0.22)
    box = Image.new("RGBA", (size + 28, size + 28), "white")
    if logo:
        lg = logo.copy(); lg.thumbnail((size, size))
        box.paste(lg, ((box.width - lg.width) // 2, (box.height - lg.height) // 2), lg)
    else:
        d = ImageDraw.Draw(box)
        d.rounded_rectangle((14, 14, box.width - 14, box.height - 14), 18, fill=GREEN)
        f = font(int(size * .6)); t = "T"
        d.text((box.width / 2, box.height / 2), t, font=f, fill="white", anchor="mm")
    q.paste(box, ((q.width - box.width) // 2, (q.height - box.height) // 2), box)

    pad = 90
    W = q.width + pad * 2
    lines = [(BRAND, font(64), GREEN), (caption, font(34, False), GREY)]
    if name:
        lines.append((name, font(30), DARK))
    if code:
        lines.append((f"SKU: {code}", font(46), DARK))
    H = pad + q.height + 40 + sum(int(f.size * 1.5) for _, f, _ in lines) + pad - 20
    img = Image.new("RGB", (W, H), "white")
    d = ImageDraw.Draw(img)
    d.rounded_rectangle((8, 8, W - 9, H - 9), 36, outline=(229, 231, 235), width=3)
    img.paste(q, (pad, pad), q)
    y = pad + q.height + 40
    for text, f, color in lines:
        if not text:
            continue
        while d.textlength(text, font=f) > W - 2 * pad and len(text) > 4:
            text = text[:-2].rstrip() + "…"
        d.text((W / 2, y), text, font=f, fill=color, anchor="ma")
        y += int(f.size * 1.5)
    out = io.BytesIO(); img.save(out, "PNG", dpi=(300, 300))
    return out.getvalue()
