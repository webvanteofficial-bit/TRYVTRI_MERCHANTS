# -*- coding: utf-8 -*-
import io, sys
so = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
P = r'C:\Users\DEll\Downloads\tryvtri-qr-studio-local\backend\crawler.py'
s = open(P, encoding='utf-8').read()
fails = []

def rep(old, new, tag):
    global s
    if old not in s:
        fails.append(tag); so.write('[FAIL] %s\n' % tag); return
    n = s.count(old)
    if n > 1:
        fails.append(tag); so.write('[AMBIG %d] %s\n' % (n, tag)); return
    s = s.replace(old, new, 1); so.write('[OK] %s\n' % tag)

rep('''            if not images:
                cdn_imgs = re.findall(
                    r'(https://cdn\\.shopify\\.com/s/files/[^"\\x27>\\s]+\\.(?:jpg|jpeg|png|webp))',
                    html,
                )''',
'''            if not images:
                cdn_imgs = re.findall(
                    r'(https://cdn\\.shopify\\.com/s/files/[^"\\x27>\\s]+\\.(?:jpg|jpeg|png|webp))',
                    html,
                )
            if not images:
                dw_high = re.findall(r'data-high-src="([^"]+)"', html) or re.findall(r'data-src="([^"]+)"', html)
                dw_high = [u for u in dw_high if any(x in u for x in ("dw/image/v2", "demandware", "dwstatic"))]
                dw_srcs = re.findall(r'(https://[^"\\x27>\\s]+/dw/image/v2/[^"\\x27>\\s]+\\.(?:jpg|jpeg|png|webp))', html, re.I)
                if dw_high:
                    cdn_imgs.extend(dw_high)
                if dw_srcs:
                    cdn_imgs.extend(dw_srcs)''', 'IMG_DW')

rep('''                images = list(dict.fromkeys(product_imgs))[:6]''',
'''                images = list(dict.fromkeys(product_imgs))[:6]
            if not images:
                dw_images = [u for u in cdn_imgs if "assets" not in u.lower() and "logo" not in u.lower() and "icon" not in u.lower()]
                dw_images = [u.split("?")[0] for u in dw_images if "sw=" not in u or "sh=" not in u or True]
                if dw_images:
                    images = list(dict.fromkeys(dw_images))[:6]''', 'IMG_DW2')

open(P, 'w', encoding='utf-8').write(s)
so.write('FAILURES: %r\n' % fails)
