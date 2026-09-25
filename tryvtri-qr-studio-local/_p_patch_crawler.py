# -*- coding: utf-8 -*-
"""Patch crawler.py: add Demandware/SFCC (Sapphire etc.) support."""
import io, sys
src = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
P = r'C:\Users\DEll\Downloads\tryvtri-qr-studio-local\backend\crawler.py'

def patch(old, new, label):
    global s
    if old not in s:
        src.write('[MISS] %s\n' % label)
        return
    cnt = s.count(old)
    if cnt != 1:
        src.write('[AMBIG %d] %s\n' % (cnt, label))
        return
    s = s.replace(old, new, 1)
    src.write('[OK] %s\n' % label)

s = open(P, encoding='utf-8').read()

patch('''        try:
            r = await c.get(self.base)
            if "woocommerce" in r.text.lower():
                return "woocommerce"
        except Exception:
            pass

        return "generic"''',
'''        try:
            r = await c.get(self.base)
            if "woocommerce" in r.text.lower():
                return "woocommerce"
        except Exception:
            pass

        try:
            r = await c.get(self.base)
            if r.status_code == 200:
                txt = r.text.lower()
                if any(m in txt for m in ("demandware", "dwstatic", "dw/image/v2", "/on/demandware.store/", "salesforcecommercecloud")):
                    return "demandware"
        except Exception:
            pass

        return "generic"''',
'DETECT>DEMANDWARE')

patch('''from typing import List, Dict, Set
from urllib.parse import urljoin, urlparse''',
'''from typing import List, Dict, Set
from urllib.parse import urljoin, urlparse, urldefrag''',
'IMPORT URLDEFRAG')

patch('''    async def _crawl_generic(self, c: httpx.AsyncClient):''',
'''    async def _crawl_generic(self, c: httpx.AsyncClient):
        if self.platform == "demandware":
            await self._crawl_demandware(c)
            return
''',
'DEMANDWARE ROUTE')

open(P, 'w', encoding='utf-8').write(s)
src.write('[WROTE] crawler.py backend pass\n')
