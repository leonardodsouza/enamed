import pymupdf, re, sys, json, os, collections
sys.path.insert(0, os.path.dirname(__file__))
from extract2 import M as MANUAL
def learn(pdfs):
    votes=collections.defaultdict(collections.Counter)
    for pdf in pdfs:
        d=pymupdf.open(pdf)
        for p in d:
            for s in p.get_texttrace():
                if not s['font'].startswith('Calibri'): continue
                for c in s['chars']:
                    if c[0]!=0xFFFD and c[0]>=32: votes[c[1]][chr(c[0])]+=1
    return {g:v.most_common(1)[0][0] for g,v in votes.items()}
def char_of(c,table,unk):
    u,g=c[0],c[1]
    if u!=0xFFFD and u>=32: return chr(u)
    FIX={121:'X',122:'Y',127:'Z',884:'–',1046:'₂'}
    if g in FIX: return FIX[g]
    if g in table: return table[g]
    ch=chr(g)
    if ch in MANUAL: return MANUAL[ch]
    unk[g]+=1; return '�'
def page_lines(page,clip,table,unk):
    chars=[]
    for s in page.get_texttrace():
        for c in s['chars']:
            x0,y0,x1,y1=c[3]; ox,oy=c[2]
            if not (clip.x0<= (x0+x1)/2 < clip.x1): continue
            if s['font'].startswith('Calibri') or True:
                ch=char_of(c,table,unk) if s['font'].startswith('Calibri') else (chr(c[0]) if c[0]!=0xFFFD else '�')
            chars.append((round(oy,0),ox,x1,ch,s['size']))
    chars.sort(key=lambda t:(t[0],t[1]))
    lines=[];cur=None;last=None
    for y,x,x1,ch,sz in chars:
        if cur is None or abs(y-cur[0])>2:
            cur=[y,''];lines.append(cur);last=None
        if last is not None and x-last>sz*1.6 and ch!=' ': cur[1]=cur[1].rstrip(' ')+'\t'
        elif last is not None and x-last>sz*0.25 and not cur[1].endswith((' ','\t')) and ch!=' ': cur[1]+=' '
        if ch==' ' and cur[1].endswith('\t'): continue
        cur[1]+=ch; last=x1 if last is None else max(last,x1)
    return [(y,t) for y,t in lines]
CLITICOS=('se','lo','la','los','las','me','te','nos','lhe','lhes','o','a','os','as','ia','ão')
PREFIXOS=('pré','pós','pró','ex','vice','recém','sem','auto','pronto','bem','mal','super','anti','pseudo','não','semi','extra','intra','infra','supra','sub','pan','ultra','micro','macro','neo','tri','bi','mini','meta')
def hifen(s):
    # junta palavras quebradas no fim da linha; mantém o hífen de verbos com pronome (ex.: queixa-se)
    def f(m):
        a,b=m.group(1),m.group(2)
        return f"{a}-{b}" if b.lower() in CLITICOS or a.lower() in PREFIXOS or b[:1].isupper() or a[-1:].isdigit() else a+b
    return re.sub(r'(\w+)-\n\s*(\w+)',f,s)
def junta(stem):
    stem=hifen(stem)
    linhas=[l.strip(' ') for l in stem.split('\n') if l.strip()]
    blocos=[];par=[]
    for l in linhas:
        if '\t' in l.strip():
            if par: blocos.append(re.sub(r'\s+',' ',' '.join(par)).strip()); par=[]
            blocos.append('\t'.join(c.strip() for c in l.strip().split('\t')))
        else: par.append(l)
    if par: blocos.append(re.sub(r'\s+',' ',' '.join(par)).strip())
    if len(blocos)>1 or '\t' in blocos[0]: return '\n'.join(blocos)
    texto=blocos[0]
    # separa o comando final (última frase) em parágrafo próprio
    m=re.search(r'^(.*[.:)”])\s+([A-ZÀ-Ú][^.]*[?]?|[A-ZÀ-Ú][^.]*)$',texto)
    if m and len(m.group(2))<400: texto=m.group(1)+'\n'+m.group(2)
    return texto
def run(pdf,outdir,tag,table):
    doc=pymupdf.open(pdf); unk=collections.Counter()
    os.makedirs(outdir,exist_ok=True)
    seq=[];imgs=[]
    repetidas=collections.Counter()
    for pno in range(1,len(doc)):
        for info in doc[pno].get_image_info(xrefs=True):
            repetidas[info.get('xref')]+=1
            if info.get('digest'): repetidas[info.get('digest')]+=1
    repetidas.pop(0,None)
    for pno in range(1,len(doc)):
        page=doc[pno]; W,H=page.rect.width,page.rect.height
        for col in (0,1):
            clip=pymupdf.Rect(col*W/2,0,(col+1)*W/2,H)
            for y,t in page_lines(page,clip,table,unk): seq.append((pno,col,y,t))
        for info in page.get_image_info(xrefs=True):
            if repetidas.get(info.get('xref'),0)>2 or repetidas.get(info.get('digest'),0)>2: continue  # logotipo do cabeçalho
            r=pymupdf.Rect(info['bbox'])
            if r.width<60 or r.height<40: continue
            col=0 if (r.x0+r.x1)/2<W/2 else 1
            imgs.append((pno,col,r))
    qs=[];cur=None
    for pno,col,y,t in seq:
        m=re.match(r'\s*(ANULADA)?\s*QUESTÃO\s+(\d+)\s*(ANULADA)?',t)
        if m:
            n=int(m.group(2))
            if cur and n<=cur['num']: break
            cur={'num':n,'anulada':bool(m.group(1) or m.group(3)),'lines':[],'start':(pno,col,y)}
            qs.append(cur); continue
        if 'QUESTIONÁRIO' in t and 'PERCEPÇÃO' in t: break
        if cur is not None: cur['lines'].append((pno,col,y,t))
    for i,q in enumerate(qs):
        start=q['start']; end=qs[i+1]['start'] if i+1<len(qs) else (999,0,0)
        q['images']=[]
        for pno,col,r in imgs:
            if start<=(pno,col,r.y0)<end:
                fn=f'{tag}-q{q["num"]:03d}-{len(q["images"])+1}.png'
                doc[pno].get_pixmap(clip=r,dpi=150).save(os.path.join(outdir,fn))
                q['images'].append(fn)
        txt=[t.rstrip() for pno,col,y,t in q['lines'] if not re.match(r'\s*(ÁREA LIVRE|Enamed 20\d\d|CADERNO\s*\d+|\d+\s*$)',t)]
        body='\n'.join(txt)
        parts=re.split(r'\n\s*\(([A-D])\)\s*','\n'+body)
        stem=re.sub(r' +',' ',parts[0]).strip(); alts={}
        for j in range(1,len(parts),2): alts[parts[j]]=re.sub(r'\s+',' ',hifen(parts[j+1])).strip()
        stem=junta(stem)
        q['stem']=stem; q['alts']=alts
        del q['lines']; del q['start']
    return qs,unk
if __name__=='__main__':
    U=os.environ.get('PDFS','pdfs')+'/'
    pdfs=[U+'acb63d12-2025_caderno_1_preliminar.pdf',U+'8e5cfcd9-2025_caderno_2_preliminar.pdf']
    table=learn(pdfs)
    for pdf,tag in [(pdfs[0],'2025'),(U+'936a9aa4-enamed-2026-caderno-01.pdf','2026')]:
        qs,unk=run(pdf,'img',tag,table)
        json.dump(qs,open(f'data_{tag}.json','w'),ensure_ascii=False,indent=1)
        print(tag,len(qs),'bad',[q['num'] for q in qs if len(q['alts'])!=4],'imgs',sum(len(q['images']) for q in qs),'unk',unk.most_common(20))
