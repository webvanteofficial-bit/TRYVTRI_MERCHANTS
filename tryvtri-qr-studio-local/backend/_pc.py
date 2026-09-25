# -*- coding: utf-8 -*-
import io, sys
s_out = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
P = r'C:\Users\DEll\Downloads\tryvtri-qr-studio-local\backend\crawler.py'
s = open(P, encoding='utf-8').read()
fails = []

def rep(old, new, tag):
    global s
    if old not in s:
        fails.append((tag, 'ANCHOR_MISS'))
        s_out.write('[FAIL anchor] %s\n' % tag)
        return
    n = s.count(old)
    if n > 1:
        fails.append((tag, 'AMBIG_%d' % n))
        s_out.write('[FAIL ambig %d] %s\n' % (n, tag))
        return
    s = s.replace(old, new, 1)
    s_out.write('[OK] %s\n' % tag)

# 1) detect demandware too (still route through generic crawler)
rep('''        try:
            r = await c.get(self.base)
            if r.status_code == 200:
                html = r.text.lower()
                markers = (
                    "demandware", "dwstatic", "dw/image/v2",
                    "/on/demandware.store/", "demandwareDotCom", "on/demandware",
                )
                if any(m in html for m in markers):
                    return "demandware"
        except Exception:
            pass

        return "generic"''',
'''        try:
            r = await c.get(self.base)
            if r.status_code == 200:
                html = r.text.lower()
                markers = (
                    "demandware", "dwstatic", "dw/image/v2",
                    "/on/demandware.store/", "demandwareDotCom", "on/demandware",
                    "demandware.store/", "bksb_prd", "sfcc",
                )
                if any(m in html for m in markers):
                    return "demandware"
        except Exception:
            pass

        return "generic"''', 'PLATFORM_MARKERS')

# 3) image extraction: also read data-high-src / data-src + demandware src
rep('''            if not images:
                for img in soup.find_all("img"):
                    srcset = img.get("srcset", "")
                    src = img.get("src", "")
                    if src and "cdn.shopify.com" in src and "assets" not in src:
                        best = self._best_from_srcset(srcset, src)
                        if best:
                            images.append(best)
                            break''',
'''            if not images:
                for img in soup.find_all("img"):
                    srcset = img.get("srcset", "")
                    src = img.get("src", "") or ""
                    hi = img.get("data-high-src") or img.get("data-src") or img.get("data-original") or ""
                    cand = hi or src
                    if (hi or src) and ("cdn.shopify.com" in cand or "/dw/image/v2/" in cand or "demandware" in cand):
                        if "assets" not in cand and "logo" not in cand:
                            best = self._best_from_srcset(srcset or hi or "", cand)
                            if best:
                                images.append(best)
                                break''', 'IMG_ATTRS')

# 4) demandware raw src regex fallback
rep('''            if not images:
                cdn_imgs = re.findall(
                    r'(https://cdn\\.shopify\\.com/s/files/[^"\\'>\\s]+\\.(?:jpg|jpeg|png|webp))',
                    html,
                )
                product_imgs = [u for u in cdn_imgs if "assets" not in u.lower() and "logo" not in u.lower()]
                if product_imgs:
                    images = list(dict.fromkeys(product_imgs))[:6]''',
'''            if not images:
                cdn_imgs = re.findall(
                    r'(https://cdn\\.shopify\\.com/s/files/[^"\\'>\\s]+\\.(?:jpg|jpeg|png|webp))',
                    html,
                )
                product_imgs = [u for u in cdn_imgs if "assets" not in u.lower() and "logo" not in u.lower()]
                if product_imgs:
                    images = list(dict.fromkeys(product_imgs))[:6]

            if not images:
                dw_imgs = re.findall(
                    r'(https://[^"\\'>\\s]+/on/demandware\\.static/[^"\\'>\\s]+\\.(?:jpg|jpeg|png|webp|[A-Z]{3,4})?)',
                    html,
                ) or re.findall(
                    r'(https://[^"\\'>\\s]+/dw/image/v2/[^"\\'>\\s]+\\.(?:jpg|jpeg|png|webp|JPG|PNG|WEBP))',
                    html,
                )
                dw_clean = [u.split("?")[0] for u in dw_imgs if u and "logo" not in u.lower()]
                if dw_clean:
                    images = list(dict.fromkeys([self._clean_image_url(u, url) for u in dw_clean]))[:6]''', 'IMG_DW')


# 5) SKU detection: demandware data-pid / productSkuKey / dw-ids
rep('''            r'"product_code"\\s*:\\s*"([^"]{3,})"''',
'''            r'"product_code"\\s*:\\s*"([^"]{3,})"',
            r'data-pid="([A-Za-z0-9][A-Za-z0-9@-_]{2,40})"',
            r'"productSkuKey"\\s*:\\s*"([^"]{3,})"',
            r'class="[^"]*product-id[^"]*"[^>]*>\\s*([A-Za-z0-9@-_]{3,40})',
            r'data-product-id="([A-Za-z0-9@-_]{3,40})"''', 'SKU_DW')

open(P, 'w', encoding='utf-8').write(s)
if fails:
    s_out.write('FAILURES: %r\n' % fails)
else:
    s_out.write('ALL_OK crawler\n')
