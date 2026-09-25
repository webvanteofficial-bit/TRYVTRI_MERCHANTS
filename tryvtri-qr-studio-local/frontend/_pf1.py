# -*- coding: utf-8 -*-
import io, sys
so = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
F = r'C:\Users\DEll\Downloads\tryvtri-qr-studio-local\frontend\index.html'
s = open(F, encoding='utf-8').read()
fails = []

def rep(old, new, tag):
    global s
    if old not in s:
        fails.append(tag); so.write('[FAIL anchor] %s\n' % tag); return
    if s.count(old) > 1:
        fails.append(tag); so.write('[FAIL ambig %d] %s\n' % (s.count(old), tag)); return
    s = s.replace(old, new, 1); so.write('[OK] %s\n' % tag)

# ---------- 1) nav: Branches -> Brands ----------
rep('''      <nav class="nav">
        [<button data-v="products" class="on">Products</button>]''',
'''      <nav class="nav">
        <button data-v="products" class="on">Products</button>''', 'X')  # noop probe (expect fail) - REMOVE in next step
