# -*- coding: utf-8 -*-
import io, sys
out = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

def show(path, a, b, label):
    print('###ANCHOR ' + label + ' -> ' + path + ' [' + str(a) + '-' + str(b) + ']###')
    try:
        l = open(path, encoding='utf-8').read().splitlines()
    except Exception as e:
        print('ERR', e)
        return
    for i in range(max(0, a - 1), min(len(l), b)):
        print('%d: %s' % (i + 1, l[i]))
    print('###END' + label + '###')

B = r'C:\Users\DEll\Downloads\tryvtri-qr-studio-local'
show(B + r'\backend\main.py', 24, 70, 'MAIN_LOGIN2')
show(B + r'\backend\main.py', 296, 373, 'MAIN_IMPORTENDP')
show(B + r'\frontend\index.html', 930, 1020, 'HTML_LOGMODAL')
show(B + r'\frontend\index.html', 630, 700, 'HTML_NAVJS')
show(B + r'\frontend\index.html', 2520, 2600, 'HTML_IMPORT2')
