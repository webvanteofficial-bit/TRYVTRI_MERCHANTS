# -*- coding: utf-8 -*-
import io, sys, re
so = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
F = r'C:\Users\DEll\Downloads\tryvtri-qr-studio-local\frontend\index.html'
s = open(F, encoding='utf-8').read()
fails = []
def rep(o, n, tag):
    global s
    if o not in s:
        fails.append(tag); so.write('[FAIL anchor] %s\n' % tag); return
    c = s.count(o)
    if c != 1:
        fails.append(tag); so.write('[FAIL ambig %d] %s\n' % (c, tag)); return
    s = s.replace(o, n, 1); so.write('[OK] %s\n' % tag)

# 1) static option text in brand selector
rep('<option value="0">All branches (same code)</option>',
    '<option value="0">All brands (same code)</option>', 'OPT_STATIC')

# 2) brand section id + heading + subtitle ("branches" noun -> "brands")
rep('<section id="v-branches" hidden>', '<section id="v-brands" hidden>', 'SEC_ID')
rep('        <h1>Branches</h1>', '        <h1>Brands</h1>', 'H1')
rep('separated by commas</label>\n          <input type="text" id="bn"',
    'separated by commas</label>\n          <input type="text" id="bn"', 'LBL_CK')  # noop safety, may fail → ignore

# 3) delete: /branches/{id} -> /brands/{id}, loadBranches -> loadBrands
rep("await api('/branches/' + x.dataset.b, { method: 'DELETE' }); loadBranches()",
    "await api('/brands/' + x.dataset.b, { method: 'DELETE' }); loadBrands()", 'LBDEL')

# 4) add: POST /branches -> /brands, toast wording
rep("await (await api('/branches', { method: 'POST', body: { name: $('bn').value } })).json()",
    "await (await api('/brands', { method: 'POST', body: { name: $('bn').value } })).json()", 'LBADD')

open(F, 'w', encoding='utf-8').write(s)
so.write('FAILURES: %r\n' % fails if fails else 'ALL_OK_frontend_micro\n')
