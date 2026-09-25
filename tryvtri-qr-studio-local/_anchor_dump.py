# -*- coding: utf-8 -*-
import io, sys
out = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

def show(path, a, b, label):
    print('###ANCHOR ' + label + ' -> ' + path + ' [%d-%d]###' % (a, b))
    try:
        l = open(path, encoding='utf-8').read().splitlines()
    except Exception as e:
        print('ERR', e)
        return
    n = len(l)
    for i in range(max(0, a - 1), min(n, b)):
        print('%d: %s' % (i + 1, l[i]))
    print('###END' + label + '###')

B = r'C:\Users\DEll\Downloads\tryvtri-qr-studio-local'

show(B + r'\backend\main.py', 21, 26, 'MAIN_IMPORTS')
show(B + r'\backend\main.py', 70, 95, 'MAIN_LOGIN')
show(B + r'\backend\main.py', 256, 305, 'MAIN_RUNIMPORT')
show(B + r'\backend\main.py', 373, 449, 'MAIN_READER')
show(B + r'\frontend\index.html', 58, 70, 'HTML_NAV')
show(B + r'\frontend\index.html', 940, 1010, 'HTML_LOGIN')
show(B + r'\frontend\index.html', 1320, 1420, 'HTML_JS')
show(B + r'\frontend\index.html', 2530, 2590, 'HTML_IMPORT')
