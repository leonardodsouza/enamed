import json,re,difflib,subprocess,os
U=os.environ.get('PDFS','pdfs')+'/'
def gab(pdf):
    t=subprocess.run(['pdftotext','-layout',pdf,'-'],capture_output=True,text=True).stdout
    t=re.sub(r'Anulada\s*\n\s*(\d+)\s+Administrati-\s+(\d+)\s+(\w)\s+(\d+)\s+(\w)',r'\1 Anulada \2 \3 \4 \5',t)
    g={}
    for m in re.finditer(r'(?<!\d)(\d{1,3})\s+(Anulada|Excluída\*?|[A-D])(?![a-z])',t):
        n=int(m.group(1))
        if 1<=n<=100 and n not in g: g[n]=m.group(2).rstrip('*')
    return g
g25=gab(U+'71ad0362-2025_gabarito_caderno_1_v2.pdf'); g26=gab(U+'95d840c1-enamed-2026-gabarito-preliminar-caderno-01.pdf')
print(len(g25),len(g26), {k:v for k,v in g25.items() if len(v)>1})
# areas
A26={'CM':[1,5,8,15,22,29,36,40,41,46,51,55,58,65,68,78,79,86,90,96],'PED':[2,9,16,23,30,33,42,45,52,53,59,66,72,73,76,91,92,97,98],'CIR':[3,10,17,24,31,37,38,43,48,60,67,74,81,93],'GO':[4,11,18,25,32,39,44,49,54,61,75,82,89,94,99],'SM':[7,14,21,28,35,47,57,64,71,85,95],'MFC':[12,13,19,26,50,69,70,83,84,87],'SC':[6,20,27,34,56,62,63,77,80,88,100]}
A25c2={'GO':[1,2,7,12,18,19,26,33,40,47,54,61,68,75,82,89,94,99],'CIR':[3,13,20,27,34,41,48,53,60,67,74,81,88,93,98],'PED':[4,6,9,14,21,28,35,42,44,49,52,59,66,80,87,92,97],'CM':[10,15,16,22,29,36,43,50,51,58,65,72,76,79,83,86,91,96,100],'MFC':[5,8,11,17,23,24,25,46,55,62,69,70,77,95],'SM':[30,32,37,57,64,71,78,85],'SC':[31,38,39,45,56,63,73,84,90]}
inv=lambda A:{n:a for a,ns in A.items() for n in ns}
a26=inv(A26); a25c2=inv(A25c2)
c2=json.load(open('8e5cfcd9-2025_caderno_2_preliminar.json'))[:100]
norm=lambda s:re.sub(r'[^a-zà-ú0-9]','',s.lower().replace('\x03',''))[:150]
c2n={norm(q['stem']):q['num'] for q in c2}
out=[]
for ano,f,g,amap in [(2025,'data_2025.json',g25,None),(2026,'data_2026.json',g26,a26)]:
    for q in json.load(open(f)):
        n=q['num']
        if amap: area=amap[n]
        else:
            m=difflib.get_close_matches(norm(q['stem']),c2n.keys(),1,0.3)
            area=a25c2[c2n[m[0]]] if m else None
        gv=g[n]; status='ativa'
        if gv=='Anulada' or q['anulada']: status='anulada'
        if gv.startswith('Excluída'): status='excluida'
        out.append({'id':f'{ano}-{n:03d}','ano':ano,'numero':n,'area':area,'enunciado':q['stem'],'alternativas':q['alts'],'gabarito':gv if gv in 'ABCD' else None,'status':status,'imagens':q['images'],'gabarito_oficial':'definitivo' if ano==2025 else 'preliminar'})
import collections
print(collections.Counter((o['ano'],o['area']) for o in out)); print(collections.Counter((o['ano'],o['status']) for o in out))
json.dump(out,open('questoes.json','w'),ensure_ascii=False,indent=1)
