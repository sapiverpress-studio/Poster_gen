"""Package only the exact owner-reviewed companion; no PDF, answers manifest or fonts."""
import base64, hashlib, json, re, sys, zipfile
from pathlib import Path
SHA=lambda x:hashlib.sha256(x).hexdigest()
EXPECTED='29335ae3de994c5919a997785d812300f20112bbe285bc38993ee7b06352e491'
ID='hb-ac23a99e42eee2c856dda344aa45877a'
ORIGIN='https://hen-bea-activity-books.netlify.app'
src,dst=map(Path,sys.argv[1:])
if SHA(src.read_bytes())!=EXPECTED: raise SystemExit('Unexpected source archive')
with zipfile.ZipFile(src) as z:
    m=z.read('BOOK_PLAN.json'); i=z.read('KDP/KDP_40_Page_Interior_A4.pdf'); h=z.read('Interactive/index.html')
    mh,ih=SHA(m),SHA(i)
    assert ID=='hb-'+SHA(f'sapiver-book-v1\n{mh}\n{ih}'.encode())[:32]
    assert SHA(h)=='c26ffc578c0bb7bc5184639b9adb4cfbcee64658e5b6a3deff298b4e38d972df'
    html=h.decode('utf-8')
    scripts=re.findall(r'<script>(.*?)</script>',html,re.S)
    assert len(scripts)==1 and not re.search(r'<script[^>]+\bsrc=',html,re.I)
    script_hash=base64.b64encode(hashlib.sha256(scripts[0].encode()).digest()).decode()
    prefix=f'play/{ID}/'
    files={prefix+'index.html':h}
    pages={}
    for n in [*range(36),39,40]:
        name=f'pages/{n:02d}.jpg'; raw=z.read('Interactive/'+name)
        assert raw.startswith(b'\xff\xd8') and raw.endswith(b'\xff\xd9')
        files[prefix+name]=raw;pages[name]=SHA(raw)
    receipt=dict(bookId=ID,manifestHash=mh,interiorHash=ih,interactiveHash=SHA(h),url=ORIGIN+'/'+prefix,status='pilot',pages=pages,title=json.loads(m)['title'],age=json.loads(m)['age'])
    files[prefix+'publication.json']=json.dumps(receipt,ensure_ascii=True,indent=2).encode()
    files['_headers']=f"""/*
  Content-Security-Policy: default-src 'none'; script-src 'sha256-{script_hash}'; style-src 'unsafe-inline'; img-src 'self'; connect-src 'none'; font-src 'none'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
  X-Robots-Tag: noindex, nofollow
  Permissions-Policy: camera=(), microphone=(), geolocation=()
  Cache-Control: no-store
""".encode()
    files['index.html']=f'''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Hen &amp; Bea Activity Books</title><style>body{{font:18px/1.5 system-ui,sans-serif;background:#f2f5ee;color:#26394d;max-width:620px;margin:32px auto;padding:20px}}article{{background:white;border-radius:16px;padding:22px}}img{{width:160px;height:auto}}a{{display:inline-block;padding:12px 16px;background:#254b61;color:white;border-radius:8px;text-decoration:none}}</style></head><body><h1>Hen &amp; Bea Activity Books</h1><article><img src="{prefix}pages/00.jpg" alt="Christmas Adventure cover"><h2>Hen &amp; Bea’s Christmas Adventure</h2><p>Ages 5–6 · Interactive companion</p><a href="{prefix}">Open activity book</a></article><p>Private pilot · Sapiver Press</p></body></html>'''.encode()
with zipfile.ZipFile(dst,'w',zipfile.ZIP_DEFLATED) as out:
    for name,raw in files.items():out.writestr(name,raw)
print('38 companion JPEGs, exact HTML, restrictive headers; no private print files.')
