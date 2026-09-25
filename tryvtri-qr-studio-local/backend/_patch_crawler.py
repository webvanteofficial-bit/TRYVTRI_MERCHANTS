# -*- coding: utf-8 -*-
import io, sys
s_out = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
P = r'C:\Users\DEll\Downloads\tryvtri-qr-studio-local\backend\crawler.py'
s = open(P, encoding='utf-8').read()
fails = []

def rep(old, new, tag):
    global s
    if old not in s:
        fails.append(tag); s_out.write('[FAIL anchor] %s\n' % tag); return
    n = s.count(old)
    if n > 1:
        fails.append(tag); s_out.write('[FAIL ambig %d] %s\n' % (n, tag)); return
    s = s.replace(old, new, 1)
    s_out.write('[OK] %s\n' % tag)

# ---- 1) image fallback: also catch demandware/SFCC image URLs (dw/image/v2 + data-high-src) ----
rep('''                cdn_imgs = re.findall(
                    r'(https://cdn\\.shopify\\.com/s/files/[^"\x27>\\s]+\\.(?:jpg|jpeg|png|webp))',
                    html,
                )
                product_imgs = [u for u in cdn_imgs if "assets" not in u.lower() and "logo" not in u.lower()]
                if product_imgs:
                    images = list(dict.fromkeys(product_imgs))[:6]''',
'''                cdn_imgs = re.findall(
                    r'(https://cdn\\.shopify\\.com/s/files/[^"\x27>\\s]+\\.(?:jpg|jpeg|png|webp))',
                    html,
                )
                dw_imgs = re.findall(
                    r'(https://[^"\x27>\\s]+/dw/image/v2/[^"\x27>\\s]+\\.(?:jpg|jpeg|png|webp))',
                    html,
                )
                dw_imgs += re.findall(
                    r'(https://[^"\x27>\\s]+/on/demandware\\.static/[^"\x27>\\s]+\\.(?:jpg|jpeg|png|webp))',
                    html,
                )
                high_src = re.findall(
                    r'data-high-src="([^"]+\\.(?:jpg|jpeg|png|webp))"',
                    html,
                )
                all_imgs = cdn_imgs + dw_imgs + high_src
                product_imgs = [u for u in all_imgs if "assets" not in u.lower() and "logo" not in u.lower() and "icon" not in u.lower()]
                if product_imgs:
                    images = list(dict.fromkeys(product_imgs))[:8]''', 'IMG_DW')

# ---- 2) SKU: add demandware/SFCC patterns (data-pid, product-id, dw sku) ----
rep('''            r'"product_code"\\s*:\\s*"([^"]{3,})"''',
'''            r'"product_code"\\s*:\\s*"([^"]{3,})"',
            r'data-pid="([^"]{3,})"',
            r'class="[^"]*product-id[^"]*"[^>]*>\\s*([^\\s<]{3,})',
            r'<meta[^>]+property="product:sku"[^>]+content="([^"]{3,})"''', 'SKU_DW')

# ---- 3) clean_image_url: keep dw/image/v2 + demandware.static urls intact (no resize regex mangling) ----
rep('''    @staticmethod
    def _clean_image_url(url: str, page_url: str) -> str:
        if not url:
            return ""
        full = urljoin(page_url, url)
        if "cdn.shopify.com" in full:
            return full
        full = re.sub(r'_(?:\\d+x\\d*|X\\d+)(\\.\\w+)$', r'\\1', full)
        return full.split("?")[0]''',
'''    @staticmethod
    def _clean_image_url(url: str, page_url: str) -> str:
        if not url:
            return ""
        full = urljoin(page_url, url)
        if "cdn.shopify.com" in full or "dw/image/v2" in full or "demandware" in full:
            return full.split("?")[0]
        full = re.sub(r'_(?:\\d+x\\d*|X\\d+)(\\.\\w+)$', r'\\1', full)
        return full.split("?")[0]''', 'CLN_DW')

open(P, 'w', encoding='utf-8').write(s)
if fails:
    s_out.write('FAILURES: %r\n' % fails)
else:
    s_out.write('ALL_OK crawler\n')
