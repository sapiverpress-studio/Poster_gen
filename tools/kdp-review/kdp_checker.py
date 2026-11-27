"""Internal KDP preparation prototype. Review-only: no live publication or QR-ready PDF."""
import hashlib, io, json, re, zipfile
from pathlib import Path
from urllib.parse import urlsplit
import argparse
import qrcode
from pypdf import PdfReader, PdfWriter
from reportlab.pdfgen import canvas
import pypdfium2 as pdfium
import cv2
import numpy as np

INTERIOR='KDP/KDP_40_Page_Interior_A4.pdf'
COVER='KDP/KDP_Full_Wrap_Cover.pdf'
MANIFEST='BOOK_PLAN.json'
HTML='Interactive/index.html'
WIDTH, HEIGHT, N, BLEED, SPINE=8.27,11.69,40,.125,.002347*40
WRAP_W,WRAP_H=WIDTH*2+SPINE+BLEED*2,HEIGHT+BLEED*2
SHA=lambda x:hashlib.sha256(x).hexdigest()

def inspect_pack(path):
    if Path(path).stat().st_size>100_000_000: raise ValueError('ZIP exceeds 100 MB')
    with zipfile.ZipFile(path) as z:
        entries=z.infolist(); names=[x.filename for x in entries]
        if len(entries)>100 or sum(x.file_size for x in entries)>200_000_000: raise ValueError('Archive limits exceeded')
        if len(set(n.casefold() for n in names))!=len(names): raise ValueError('Duplicate archive names')
        for x in entries:
            if x.flag_bits&1 or x.file_size>50_000_000 or x.file_size>100*max(1,x.compress_size) or (x.external_attr>>16)&0o170000==0o120000: raise ValueError('Unsafe archive entry')
            if x.filename.startswith('/') or '\\' in x.filename or '..' in x.filename.split('/'): raise ValueError('Unsafe archive path')
        manifest,interior,cover,html=(z.read(n) for n in (MANIFEST,INTERIOR,COVER,HTML))
        for page in [*range(36),39,40]:
            if f'Interactive/pages/{page:02d}.jpg' not in names: raise ValueError('Missing interactive page')
    data=json.loads(manifest)
    if not isinstance(data.get('title'),str) or not re.fullmatch(r'\d{1,2}[-–]\d{1,2}',data.get('age','')): raise ValueError('Invalid book manifest')
    if [p['page'] for p in data['pages']]+data['endMatter']!=list(range(1,41)): raise ValueError('Invalid page numbering')
    mh,ih=SHA(manifest),SHA(interior)
    identity={'bookId':'hb-'+SHA(f'sapiver-book-v1\n{mh}\n{ih}'.encode())[:32],'manifestHash':mh,'interiorHash':ih,'interactiveHash':SHA(html)}
    return data,identity,interior,cover

def check_pdf(raw, count, width, height):
    reader=PdfReader(io.BytesIO(raw),strict=True)
    if reader.is_encrypted or len(reader.pages)!=count: raise ValueError('Unexpected PDF page count or encryption')
    minimum=1e9
    for i,p in enumerate(reader.pages,1):
        if p.rotation or tuple(p.mediabox)!=tuple(p.cropbox) or any(abs(float(x))>.01 for x in (p.mediabox.left,p.mediabox.bottom)): raise ValueError(f'Page {i}: crop or rotation mismatch')
        w,h=map(float,(p.mediabox.width,p.mediabox.height))
        if abs(w-width*72)>.15 or abs(h-height*72)>.15: raise ValueError(f'Page {i}: incorrect PDF size')
        content=p.get_contents().get_data().decode('ascii').strip()
        match=re.fullmatch(r'q\s+([\d.]+)\s+0\s+0\s+([\d.]+)\s+0\s+0\s+cm\s+(/[A-Za-z0-9]+)\s+Do\s+Q',content)
        if not match or abs(float(match[1])-w)>.02 or abs(float(match[2])-h)>.02 or len(p.images)!=1: raise ValueError(f'Page {i}: unsupported raster layout')
        img=p.images[match[3]].image
        effective=min(img.width/(w/72),img.height/(h/72)); minimum=min(minimum,effective)
        if effective<299.95: raise ValueError(f'Page {i}: below 300 PPI tolerance')
    return {'pages':count,'width_inches':width,'height_inches':height,'min_effective_ppi':round(minimum,2)}

def add_review_qr(cover, url):
    if urlsplit(url).hostname!='books.example.invalid': raise ValueError('Prototype accepts only reserved test origin')
    width,height=WRAP_W*72,WRAP_H*72
    buf=io.BytesIO(); c=canvas.Canvas(buf,pagesize=(width,height))
    x,y,w,h=1.4*72,(WRAP_H-10.1)*72,5.1*72,1.45*72
    c.setFillColorRGB(1,1,1);c.setStrokeColorRGB(.15,.29,.38);c.roundRect(x,y,w,h,7,fill=1,stroke=1)
    qr=qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_M,border=4);qr.add_data(url);qr.make(fit=True)
    matrix=qr.get_matrix(); n=len(matrix); side=1.30*72; module=side/n; qx=x+7;qy=y+(h-side)/2
    c.setFillColorRGB(0,0,0)
    for row,line in enumerate(matrix):
        for col,dark in enumerate(line):
            if dark:c.rect(qx+col*module,qy+(n-1-row)*module,module,module,stroke=0,fill=1)
    c.setFillColorRGB(.15,.29,.38); c.setFont('Helvetica-Bold',13);c.drawString(x+side+18,y+h-25,'Play the activities online')
    c.setFont('Helvetica',10);c.drawString(x+side+18,y+h-44,'Scan with a grown-up to explore your book.')
    c.setFillColorRGB(.65,0,0);c.setFont('Helvetica-Bold',10);c.drawString(x+side+18,y+15,'REVIEW ONLY - TEST LINK')
    c.save();buf.seek(0)
    reader=PdfReader(io.BytesIO(cover),strict=True);page=reader.pages[0];page.merge_page(PdfReader(buf).pages[0]);out=io.BytesIO();writer=PdfWriter();writer.add_page(page);writer.write(out);raw=out.getvalue()
    doc=pdfium.PdfDocument(raw); im=doc[0].render(scale=300/72).to_pil().convert('RGB'); scale=300/72
    box=(int((qx-2)*scale),int((height-qy-side-2)*scale),int((qx+side+2)*scale)+1,int((height-qy+2)*scale)+1)
    crop=np.asarray(im.crop(box)); decoded,_,_=cv2.QRCodeDetector().detectAndDecode(cv2.cvtColor(crop,cv2.COLOR_RGB2GRAY))
    if decoded!=url: raise ValueError('QR decode verification failed')
    return raw,im

def main():
    parser=argparse.ArgumentParser(description='KDP companion book review prototype (not production-ready)');parser.add_argument('zip');parser.add_argument('--output',default='kdp_review');args=parser.parse_args()
    data,identity,interior,cover=inspect_pack(args.zip)
    report={'title':data['title'],'age':data['age'],**identity,'interior':check_pdf(interior,N,WIDTH,HEIGHT),'cover':check_pdf(cover,1,WRAP_W,WRAP_H),'print_profile':'Paperback / premium colour / white paper / A4 / no interior bleed / 0.125 inch cover bleed / no spine text','status':'REVIEW ONLY - companion host not verified'}
    url='https://books.example.invalid/play/'+identity['bookId']+'/'
    _,im=add_review_qr(cover,url); out=Path(args.output);out.mkdir(parents=True,exist_ok=True)
    im.thumbnail((1800,1800));im.save(out/'cover_review.png');report['test_qr_decoded']=True;report['test_qr_url']=url
    (out/'inspection.json').write_text(json.dumps(report,indent=2),encoding='utf-8');print(json.dumps(report,indent=2))

if __name__=='__main__':main()
