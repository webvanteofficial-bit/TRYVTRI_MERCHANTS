# -*- coding: utf-8 -*-
import io, sys
so = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
P = r'C:\Users\DEll\Downloads\tryvtri-qr-studio-local\backend\crawler.py'
s = open(P, encoding='utf-8').read()

anchor = '''            if not sku:
                sku = self._detect_sku_from_html(html)'''
if anchor not in s:
    so.write('[FAIL] sku anchor missing\n')
    raise SystemExit(1)

newblock = '''            if not images:
                dw_imgs = []
                for img in soup.find_all("img"):
                    for attr in ("data-high-src", "data-src", "src"):
                        u = (img.get(attr) or "").strip()
                        if u and ("dw/image/v2" in u or "demandware.static" in u or u.startswith("https://") and "/dwstatic/" in u):
                            dw_imgs.append(u)
                            break
                if not dw_imgs:
                    dw_imgs += re.findall(
                        r'(https://[^"' + "\\'" + r'>\s]+/dw/image/v2/[^"' + "\\'" + r'>\s]+\.(?:jpg|jpeg|png|webp))',
                        html,
                    )
                    dw_imgs += re.findall(
                        r'data-high-src="([^"]+\.(?:jpg|jpeg|png|webp))"',
                        html,
                    )
                dw_imgs = [u for u in dw_imgs if "assets" not in u.lower() and "logo" not in u.lower() and "icon" not in u.lower()]
                if dw_imgs:
                    images = (images or []) + list(dict.fromkeys(dw_imgs))[:6]

            if not sku:
                sku = self._detect_sku_from_html(html)'''

s = s.replace(anchor, newblock, 1)
open(P, 'w', encoding='utf-8').write(s)
so.write('[OK] IMG_DW inserted\n')
