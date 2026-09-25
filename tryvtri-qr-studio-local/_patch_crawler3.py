# -*- coding: utf-8 -*-
import io, sys
so = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
P = r'C:\Users\DEll\Downloads\tryvtri-qr-studio-local\backend\crawler.py'
s = open(P, encoding='utf-8').read()
fails = []

rep = '''            if not images:
                cdn_imgs = re.findall(
                    r'(https://cdn\\.shopify\\.com/s/files/[^"\\x27>\\s]+\\.(?:jpg|jpeg|png|webp))',
                    html,
                )
                product_imgs = [u for u in cdn_imgs if "assets" not in u.lower() and "logo" not in u.lower()]
                if product_imgs:
                    images = list(dict.fromkeys(product_imgs))[:6]
'''
new = rep + '''            if not images:
                dw_imgs = re.findall(
                    r'(https://[^"\\x27>\\s]+/dw/image/v2/[^"\\x27>\\s]+\\.(?:jpg|jpeg|png|webp))',
                    html,
                )
                dw_imgs += re.findall(
                    r'(https://[^"\\x27>\\s]+/on/demandware\\.static/[^"\\x27>\\s]+\\.(?:jpg|jpeg|png|webp))',
                    html,
                )
                dw_imgs += re.findall(
                    r'data-high-src="([^"]+\\.(?:jpg|jpeg|png|webp))"',
                    html,
                )
                dw_imgs += re.findall(
                    r'data-src="([^"]+\\.(?:jpg|jpeg|png|webp))"',
                    html,
                )
                product_dw = [
                    u for u in dw_imgs
                    if "logo" not in u.lower() and "icon" not in u.lower() and "swatch" not in u.lower() and "assets" not in u.lower()
                ]
                if product_dw:
                    images = list(dict.fromkeys(product_dw))[:6]
'''
if rep not in s:
    if 'cdn_imgs' in rep or ('cdn_imgs' in rep):
        if s.count('cdn_imgs = re.findall(') == 1:
            # byte-lenient fallback: locate by line
            lines = s.splitlines()
            for idx, ln in enumerate(lines):
                if 'cdn_imgs = re.findall(' in ln:
                    # rebuild block exactly by replacing those exact lines
                    block = '\n'.join(lines[idx:idx+7]) + '\n'
                    s = s.replace('\n'.join(lines[idx:idx+7])+'\n', new, 1)
                    so.write('[OK] IMG_DW line-spliced at %d\n' % (idx+1))
                    break
            else:
                fails.append('IMG_DW')
    else:
        fails.append('IMG_DW')
else:
    s = s.replace(rep, new, 1)
    so.write('[OK] IMG_DW block\n')

open(P, 'w', encoding='utf-8').write(s)
so.write('FAILURES: %r\n' % fails)
