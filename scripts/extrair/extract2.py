import pymupdf, re, sys, json, os
LOW=dict(zip("ĂďĐĚĞĨŐŚŝũŬůŵŶŽƉƋƌƐƚƵǀǁǆǇǌ","abcdefghijklmnopqrstuvwxyz"))
EXTRA={'ſ':'ó','Ɵ':'ti','Ć':'ã','ġ':'ê','ş':'í','Ġ':'é','ĕ':'ç','Į':'fi','Ň':'fl','ơ':'tí','İ':'fí','Ʒ':'ú','ă':'à','ą':'â','Ą':'á','ƀ':'ô','Ɓ':'õ','͕':',','͘':'.','͖':';','͗':':','ͬ':'/','Ͳ':'-','н':'+','й':'%','͍':'?','͟':'”','͞':'“','ф':'<','х':'>','Ϳ':')','Σ':'°C','ƞ':'tf','Ō':'ff','ŝ':'i','ǐ':'ª','ǯ':'º','Ͳ':'-','Ͷ':'–','ʹ':'’','͛':'‘','Ŷ':'n','Ɖ':'p','\u037e':';'}
for i,c in enumerate("ϬϭϮϯϰϱϲϳϴϵ"): EXTRA[c]=str(i)
UP={'\x04':'A','\x05':'À','\x11':'B','\x12':'C','\x18':'D','\x1c':'E','&':'F',"'":'G',',':'H','/':'I',':':'J','<':'K','>':'L','D':'M','E':'N','K':'O','W':'P','Y':'Q','Z':'R','^':'S','d':'T','h':'U','s':'V','t':'W','u':'X','v':'Y','|':'Z',';':'(','\x03':' ','\x06':'Á','\x07':'Â','\x08':'Ã','\x1d':'É','\x30':'Í'}
M={**LOW,**EXTRA,**UP}
unknown={}
def dec_span(s):
    out=[]
    for ch in s['chars']:
        c=ch['c']
        if s['font'].startswith('C2') or '+' in s['font'] and s.get('_type0'):
            pass
        out.append(c)
    return ''.join(out)
def page_text(page,clip,type0):
    d=page.get_text('rawdict',clip=clip,sort=True)
    lines=[]
    for b in d['blocks']:
        if b['type']!=0: continue
        for l in b['lines']:
            t=''
            for s in l['spans']:
                isT0=s['font'] in type0
                for ch in s['chars']:
                    c=ch['c']
                    if isT0:
                        if c in M: c=M[c]
                        elif not (c.isascii() and (c.isalnum() or c in ' .,()-')):
                            unknown[c]=unknown.get(c,0)+1
                    t+=c
            lines.append((round(l['bbox'][1]),t))
    return lines
def run(pdf,outdir,tag):
    doc=pymupdf.open(pdf)
    type0=set()
    for p in doc:
        for f in p.get_fonts():
            if f[2]=='Type0' and 'Calibri' in f[3]: type0.add(f[3].split('+')[-1])
    # span font names come without subset prefix
    os.makedirs(outdir,exist_ok=True)
    seq=[]  # (page,col,y,text)
    imgs=[]
    for pno in range(1,len(doc)):
        page=doc[pno]; W,H=page.rect.width,page.rect.height
        for col in (0,1):
            clip=pymupdf.Rect(col*W/2,0,(col+1)*W/2,H)
            for y,t in page_text(page,clip,type0): seq.append((pno,col,y,t))
        for info in page.get_image_info():
            r=pymupdf.Rect(info['bbox'])
            if r.width<60 or r.height<40: continue
            col=0 if (r.x0+r.x1)/2<W/2 else 1
            imgs.append((pno,col,r))
    # split into questions
    qs=[];cur=None;phase=0
    for pno,col,y,t in seq:
        m=re.match(r'\s*QUESTÃO\s+(\d+)\s*(ANULADA)?',t)
        if m:
            n=int(m.group(1))
            if cur and n<=cur['num']: phase=1
            if phase: cur=None; break
            cur={'num':n,'anulada':bool(m.group(2)),'lines':[],'start':(pno,col,y)}
            qs.append(cur); continue
        if 'QUESTIONÁRIO DE PERCEPÇÃO' in t: break
        if cur is not None: cur['lines'].append((pno,col,y,t))
    for i,q in enumerate(qs):
        start=q['start']; end=qs[i+1]['start'] if i+1<len(qs) else (999,0,0)
        q['images']=[]
        for k,(pno,col,r) in enumerate(imgs):
            if start<=(pno,col,r.y0)<end:
                fn=f'{tag}-q{q["num"]:03d}-{len(q["images"])+1}.png'
                pix=doc[pno].get_pixmap(clip=r,dpi=150); pix.save(os.path.join(outdir,fn))
                q['images'].append(fn)
        txt=[]
        for pno,col,y,t in q['lines']:
            if re.match(r'\s*(ÁREA LIVRE|Enamed 20\d\d|CADERNO \d+|\d+\s*$)',t) : continue
            txt.append(t.rstrip())
        body='\n'.join(txt)
        parts=re.split(r'\n\s*\(([A-D])\)\s*',('\n'+body))
        stem=parts[0].strip(); alts={}
        for j in range(1,len(parts),2): alts[parts[j]]=re.sub(r'\s+',' ',parts[j+1]).strip()
        stem=re.sub(r'[ \t]+',' ',stem)
        stem=re.sub(r'(?<![.:?!])\n(?!\s*[-•])',' ',stem)
        q['stem']=stem.strip(); q['alts']=alts
        del q['lines']; del q['start']
    return qs
if __name__=='__main__':
    qs=run(sys.argv[1],sys.argv[3],sys.argv[4])
    json.dump(qs,open(sys.argv[2],'w'),ensure_ascii=False,indent=1)
    print(len(qs),'bad',[q['num'] for q in qs if len(q['alts'])!=4],'imgs',sum(len(q['images']) for q in qs),'unknown',sorted(unknown.items(),key=lambda x:-x[1])[:30])
