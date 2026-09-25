# -*- coding: utf-8 -*-
import io, sys
so = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
B = r'C:\Users\DEll\Downloads\tryvtri-qr-studio-local'
R = B + r'\requirements.txt'

# 1) requirements: ensure tinydb
rq = open(R, encoding='utf-8').read()
if 'tinydb' not in rq.lower():
    rq = rq.rstrip() + '\ntinydb\n'
    open(R, 'w', encoding='utf-8').write(rq)
    so.write('[OK] requirements += tinydb\n')
else:
    so.write('[SKIP] tinydb already in requirements\n')

# 2) crawler demandware images + sku
P = B + r'\backend\crawler.py'
s = open(P, encoding='utf-8').read()
fails = []

def ins_after_line(needle, newblock, tag, occurrence=1):
    global s
    lines = s.split('\n')
    idxs = [i for i, l in enumerate(lines) if needle in l]
    if not idxs:
        fails.append(tag); so.write('[FAIL] %s (anchor missing)\n' % tag); return
    if len(idxs) < occurrence:
        fails.append(tag); so.write('[FAIL] %s (occurr %d < %d)\n' % (tag, len(idxs), occurrence)); return
    i = idxs[occurrence - 1]
    lines[i:i] = newblock.split('\n')
    s_out = '\n'.join(lines)
    # verify newblock integrity
    if '\u00ff' in s_out or '�' in s_out and '�' in newblock:
        pass
    open(P, 'w', encoding='utf-8').write('\n'.join(lines))
    so.write('[OK] %s\n' % tag)

# insert demandware image fallback right after the cdn_imgs fallback block
ins_after_line('images = list(dict.fromkeys(product_imgs))[:6]',
'''            if not images:
                dw_imgs = re.findall(
                    r'(https://[^"\\' >\\s]+/dw/image/v2/[^"\\' >\\s]+\\.(?:jpg|jpeg|png|webp))',
                    html,
                )
                dw_imgs += re.findall(
                    r'(https://[^"\\' >\\s]+/on/demandware\\.static/[^"\\' >\\s]+\\.(?:jpg|jpeg|png|webp))',
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
                product_dw = [u for u in dw_imgs if "assets" not in u.lower() and "logo" not in u.lower() and "icon" not in u.lower()]
                if product_dw:
                    images = list(dict.fromkeys(product_dw))[:6]''',
'IMG_DW_AFTER')

if fails:
    so.write('FAILURES: %r\n' % fails)
else:
    so.write('ALL_OK crawler+requirements\n')
